import { Request, Response, NextFunction } from "express";
import mongoose, { startSession, ClientSession } from "mongoose";
import Order from "../models/Order.model";
import Product from "../models/Product.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import User from "../models/User.model";
import CoinLedger from "../models/CoinLedger.model";
import { OrderData, OrderItem, PaymentInfo, ShippingInfo } from "../types/orderTypes";
import Coupon from "../models/Coupon.model";
import { emitToAdmin, SocketEvents } from "../config/socket";
import { isValidObjectId } from "../utils/common.utils";
import { Cart } from "../models/Cart.model";
import SettingsModel from "../models/Settings.model";
import emailService from "../services/email.Service";
import { createNotification, notifyAdmins } from "./notification.controller";
// import { calculateOrderTotals } from "../utils/order.utils";
import { AuthRequest } from "../types/index";

// Constants
const ORDER_STATUS = {
  PLACED: "placed",
  NEW: "new",
  PENDING: "pending",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as any;

const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;

const MAX_ORDER_ITEMS = 50;


// Helper Functions
// (isValidObjectId moved to common.utils)

const validateShippingInfo = (shippingInfo: ShippingInfo): string[] => {
  const errors: string[] = [];

  if (!shippingInfo) {
    errors.push("Shipping information is required");
    return errors;
  }

  if (!shippingInfo.address || shippingInfo.address.length < 10) {
    errors.push("Address must be at least 10 characters");
  }

  if (!shippingInfo.city || shippingInfo.city.trim().length < 2) {
    errors.push("City is required");
  }

  if (!shippingInfo.state || shippingInfo.state.trim().length < 2) {
    errors.push("State is required");
  }

  if (!shippingInfo.country || shippingInfo.country.trim().length < 2) {
    errors.push("Country is required");
  }

  if (
    !shippingInfo.pinCode ||
    !/^\d{4,10}$/.test(shippingInfo.pinCode.toString())
  ) {
    errors.push("Valid pin code is required");
  }

  if (
    !shippingInfo.phoneNo ||
    !/^\d{10,15}$/.test(shippingInfo.phoneNo.toString())
  ) {
    errors.push("Valid phone number is required (10-15 digits)");
  }

  return errors;
};

const validateOrderItems = async (
  orderItems: OrderItem[]
): Promise<{ valid: boolean; errors: string[] }> => {
  const errors: string[] = [];

  if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    errors.push("Order must contain at least one item");
    return { valid: false, errors };
  }

  if (orderItems.length > MAX_ORDER_ITEMS) {
    errors.push(`Order cannot contain more than ${MAX_ORDER_ITEMS} items`);
    return { valid: false, errors };
  }

  // Check for duplicate products
  const productIds = orderItems.map((item) => item.product);
  const uniqueIds = new Set(productIds);
  if (productIds.length !== uniqueIds.size) {
    errors.push("Duplicate products in order. Please combine quantities");
  }

  // Validate each item
  for (let i = 0; i < orderItems.length; i++) {
    const item = orderItems[i];

    if (!item.product || !isValidObjectId(item.product)) {
      errors.push(`Invalid product ID at item ${i + 1}`);
      continue;
    }

    if (
      !item.quantity ||
      item.quantity < 1 ||
      !Number.isInteger(item.quantity)
    ) {
      errors.push(`Invalid quantity for item ${i + 1}`);
    }

    if (!item.sellingPrice || item.sellingPrice <= 0) {
      errors.push(`Invalid price for item ${i + 1}`);
    }

    // Verify product exists and has sufficient stock
    const product = await Product.findById(item.product);

    if (!product) {
      errors.push(`Product not found: ${item.name || item.product}`);
      continue;
    }

    if (product.stock < item.quantity) {
      errors.push(
        `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
      );
    }

    // Verify price matches current product price
    if (Math.abs(product.sellingPrice - item.sellingPrice) > 0.01) {
      errors.push(
        `Price mismatch for ${product.name}. Current price: ${product.sellingPrice}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
};

const validatePaymentInfo = (paymentInfo: PaymentInfo): string[] => {
  const errors: string[] = [];

  if (!paymentInfo) {
    errors.push("Payment information is required");
    return errors;
  }

  if (!paymentInfo.id || paymentInfo.id.trim().length === 0) {
    errors.push("Payment ID is required");
  }

  if (
    !paymentInfo.status ||
    !Object.values(PAYMENT_STATUS).includes(paymentInfo.status.toLowerCase() as any)
  ) {
    errors.push("Invalid payment status");
  }

  if (!paymentInfo.method || paymentInfo.method.trim().length === 0) {
    errors.push("Payment method is required");
  }

  return errors;
};



const updateProductStock = async (orderItems: OrderItem[], session?: ClientSession): Promise<void> => {
  const stockUpdates = orderItems.map(async (item) => {
    let query = Product.findById(item.product);
    if (session) {
      query = query.session(session);
    }
    const product = await query;

    if (product) {
      if (product.stock < item.quantity) {
        throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
      }
      product.stock -= item.quantity;
      await product.save({ validateBeforeSave: false, session: session || undefined });
    }
  });

  await Promise.all(stockUpdates);
};

const restoreProductStock = async (orderItems: OrderItem[], session?: ClientSession): Promise<void> => {
  const stockUpdates = orderItems.map(async (item) => {
    let query = Product.findById(item.product);
    if (session) {
      query = query.session(session);
    }
    const product = await query;

    if (product) {
      product.stock += item.quantity;
      await product.save({ validateBeforeSave: false, session: session || undefined });
    }
  });

  await Promise.all(stockUpdates);
};

// ... (existing code imports)

// Controllers

// ... 

export const createOrder = asyncHandler(
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const orderData = req.body as OrderData;
    const userId = req.user?._id;

    // Validate shipping info
    const shippingErrors = validateShippingInfo(orderData.shippingInfo);
    if (shippingErrors.length > 0) {
      throw ApiError.badRequest(shippingErrors.join(", "));
    }

    // Securely fetch items from Cart (Source of Truth)
    const cart = await Cart.findOne({ user: userId });
    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest("Cart is empty");
    }

    // Start MongoDB Session for Atomic Transaction
    const session = await startSession();
    let inTransaction = false;
    try {
      session.startTransaction();
      inTransaction = true;
    } catch (err) {
      // Transactions not supported (e.g. standalone test db), proceed without
    }

    try {
      // Map Cart Items to Order Items
      // Pre-fetch products to get actualPrice
      const productIds = cart.items.map((item: any) => item.product);
      const products = await Product.find({ _id: { $in: productIds } }).select("actualPrice").lean();
      const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

      // Map Cart Items to Order Items
      const serverOrderItems = cart.items.map((item: any) => {
        const product = productMap.get(item.product.toString());
        return {
          product: item.product,
          name: item.productName,
          sellingPrice: item.sellingPrice,
          actualPrice: product?.actualPrice,
          image: item.productImage,
          quantity: item.quantity,
          size: item.variant?.size,
          color: item.variant?.color,
        };
      });

      // Validate order items (Stock check & Price Freshness check)
      const itemValidation = await validateOrderItems(serverOrderItems);
      if (!itemValidation.valid) {
        throw ApiError.badRequest(itemValidation.errors.join(", "));
      }

      // Validate payment info
      const paymentErrors = validatePaymentInfo(orderData.paymentInfo);
      if (paymentErrors.length > 0) {
        throw ApiError.badRequest(paymentErrors.join(", "));
      }

      // COD Validation against settings
      const settings = await SettingsModel.findOne();
      if (orderData.paymentMethod === 'COD') {
        if (!settings || !settings.codEnabled) {
          throw ApiError.badRequest("Cash on Delivery is currently disabled");
        }
        // Use the final amount after discounts/coins for the threshold check
        const validation = req.orderValidation;
        if (validation && validation.finalAmount < (settings.codMinimumAmount || 0)) {
          throw ApiError.badRequest(`Cash on Delivery is only available for orders above ₹${settings.codMinimumAmount}`);
        }
      }

      // Use validation result from middleware
      const validation = req.orderValidation;
      if (!validation) {
        throw ApiError.internal("Order validation failed");
      }

      // Calculating totals from validation result
      const { itemsPrice, shippingCharges } = validation;
      const finalTotal = validation.finalAmount;
      const coinsToRedeem = validation.redeemCoins;
      const couponDiscount = validation.couponDiscount;
      const usedCouponCode = validation.couponCode;

      const querySession = inTransaction ? session : undefined;
      const dbOptions = querySession ? { session: querySession } : {};

      // Apply Coin Deductions (Transactional)
      if (coinsToRedeem > 0) {
        await User.findByIdAndUpdate(userId, { $inc: { rewardPoints: -coinsToRedeem } }, dbOptions);

        await CoinLedger.create([{
          user: userId,
          amount: -coinsToRedeem,
          type: 'redeem',
          description: `Redeemed on order`,
          createdAt: new Date()
        }], dbOptions);
      }

      // Apply Coupon Usage (Transactional)
      if (usedCouponCode && validation.coupon) {
        // Re-fetch to ensure lock/update in session
        let couponQuery = Coupon.findById(validation.coupon._id);
        if (querySession) couponQuery = couponQuery.session(querySession);
        const coupon = await couponQuery;

        if (coupon) {
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } }, dbOptions);
        }
      }

      // Update product stock with Session
      await updateProductStock(serverOrderItems, querySession as any);

      // Create order with Session
      const [order] = await Order.create([{
        shippingInfo: orderData.shippingInfo,
        orderItems: serverOrderItems,
        paymentInfo: orderData.paymentInfo,
        itemsPrice: itemsPrice,
        shippingPrice: shippingCharges,
        totalPrice: finalTotal,
        redeemCoins: coinsToRedeem,
        coupon: usedCouponCode ? {
          code: usedCouponCode,
          discount: couponDiscount
        } : undefined,
        paidAt: orderData.paymentInfo.status === PAYMENT_STATUS.SUCCEEDED ? Date.now() : undefined,
        user: userId,
        orderStatus: ORDER_STATUS.PLACED,
      }], dbOptions);

      // Clear Cart with Session
      let cartQuery = Cart.findOne({ user: userId });
      if (querySession) cartQuery = cartQuery.session(querySession);
      const cartToUpdate = await cartQuery;

      if (cartToUpdate) {
        cartToUpdate.items = [];
        cartToUpdate.subtotal = 0;
        cartToUpdate.couponCode = undefined;
        cartToUpdate.isCoinsRedeemed = false;
        await cartToUpdate.save(dbOptions);
      }

      // Commit the transaction
      if (inTransaction) {
        await session.commitTransaction();
      }
      session.endSession();

      // Background tasks (Post-payment)
      try {
        const settings = await SettingsModel.findOne();
        if (settings && settings.orderEmailEnabled) {
          const user = await User.findById(userId);
          if (user) {
            await emailService.sendOrderConfirmation(user.email, user.name, String(order._id), order.totalPrice, order.orderItems);
          }
        }
      } catch (emailError: any) {
        console.error("Failed to send order email:", emailError.message);
      }

      emitToAdmin(SocketEvents.ORDER_CREATED, {
        orderId: order._id,
        totalPrice: order.totalPrice,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
      });
      emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'order_created' });

      // Notify User
      await createNotification(
        String(userId),
        'order_status',
        'Order Placed',
        `Your order #${order._id} has been successfully placed.`,
        { orderId: order._id }
      );

      // Notify Admins
      await notifyAdmins(
        'system_alert',
        'New Order Received',
        `New order #${order._id} placed by ${req.user?.name || 'User'} for ₹${order.totalPrice}.`,
        { orderId: order._id }
      );

      res.status(201).json(ApiResponse.created({ order }, "Order placed successfully"));

    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);
      // Abort transaction on failure
      if (inTransaction) {
        await session.abortTransaction();
      }
      session.endSession();
      throw error;
    }
  }
);

/**
 * Get single order details
 * GET /api/orders/:id
 */
export const getSingleOrder = asyncHandler(
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid order ID");
    }

    const order = await Order.findById(id)
      .populate("user", "name email")
      .populate("orderItems.product", "name images")
      .lean();


    if (!order) {
      throw ApiError.notFound("Order not found");
    }

    // Check if user is authorized to view this order
    if ((order.user as any)._id.toString() !== req.user?._id.toString() && (req.user as any).role !== "admin") {
      throw ApiError.forbidden("Not authorized to view this order");
    }

    res.status(200).json(ApiResponse.success({ order }));
  }
);

/**
 * Get logged in user orders
 * GET /api/orders/me
 */
export const myOrders = asyncHandler(
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user?._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("orderItems.product", "name images sellingPrice")
      .lean();

    const totalOrders = await Order.countDocuments({ user: req.user?._id });


    res.status(200).json(ApiResponse.success({
      orders,
      totalOrders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
    }));
  }
);

/**
 * Get all orders - Admin
 * GET /api/admin/orders
 */
export const getAllOrders = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;

    const pipeline: any[] = [];

    // Match stage
    const matchStage: any = {};
    if (status && Object.values(ORDER_STATUS).includes(status as any)) {
      matchStage.orderStatus = status;
    }
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Lookup User
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userInfo"
      }
    });
    pipeline.push({ $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } });

    // Lookup Products (for search)
    pipeline.push({
      $lookup: {
        from: "products",
        localField: "orderItems.product",
        foreignField: "_id",
        as: "productInfo"
      }
    });

    // Search filter
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      pipeline.push({
        $match: {
          $or: [
            // Search by Order ID (if valid ObjectId)
            ...(isValidObjectId(search) ? [{ _id: new mongoose.Types.ObjectId(search) }] : []),
            // Search by User Name/Email
            { "userInfo.name": searchRegex },
            { "userInfo.email": searchRegex },
            // Search by Shipping Info
            { "shippingInfo.fullName": searchRegex },
            { "shippingInfo.city": searchRegex },
            { "shippingInfo.state": searchRegex },
            // Search by Product Name
            { "productInfo.name": searchRegex }
          ]
        }
      });
    }

    // Sort
    pipeline.push({ $sort: { createdAt: -1 } });

    // Facet for pagination and counts
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }]
      }
    });

    const result = await Order.aggregate(pipeline);

    const orders = result[0].data;
    const totalOrders = result[0].metadata[0] ? result[0].metadata[0].total : 0;

    // Populate (manual since we used aggregation) - actually we already looked up user. 
    // But let's shape it to match previous response structure or keep it as is.
    // The previous response returned Mongoose documents populated. 
    // Aggregation returns plain objects. 
    // We need to map `userInfo` back to `user` field to match frontend expectations if it relies on `user.name`.
    // The frontend expects `user: { name, email }`.

    const formattedOrders = orders.map((order: any) => ({
      ...order,
      user: order.userInfo ? { _id: order.userInfo._id, name: order.userInfo.name, email: order.userInfo.email } : null,
      orderItems: order.orderItems.map((item: any) => {
        // find checks productInfo
        const product = order.productInfo.find((p: any) => p._id.toString() === item.product.toString());
        return { ...item, product: product ? { name: product.name } : item.product };
      })
    }));

    // Calculate total revenue (global, not filtered)
    // Optimization: Run this in parallel or separately if needed. 
    // But since filters might apply to revenue too in some designs, usually 'Total Revenue' on dashboard is global.
    // The existing code calculated global revenue.
    const revenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const totalRevenue = revenue.length > 0 ? revenue[0].total : 0;

    res.status(200).json(ApiResponse.success({
      orders: formattedOrders,
      totalOrders,
      totalRevenue,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
    }));
  }
);

/**
.

 * Update order status - Admin
 * PUT /api/admin/orders/:id
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid order ID");
    }

    if (!status || !Object.values(ORDER_STATUS).includes(status)) {
      throw ApiError.badRequest("Invalid order status");
    }

    const order = await Order.findById(id);

    if (!order) {
      throw ApiError.forbidden("Order not found");
    }

    // Prevent status change if already delivered
    if (order.orderStatus.toLowerCase() === ORDER_STATUS.DELIVERED) {
      throw ApiError.badRequest("Order already delivered");
    }

    // Prevent status change if cancelled
    if (order.orderStatus.toLowerCase() === ORDER_STATUS.CANCELLED) {
      throw ApiError.badRequest("Cannot update cancelled order");
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      [ORDER_STATUS.PLACED]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.NEW]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.PENDING]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED],
    };

    const currentStatus = order.orderStatus.toLowerCase();
    const allowedStatuses = validTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(status)) {
      throw ApiError.badRequest(
        `Cannot change status from ${order.orderStatus} to ${status}`
      );
    }

    // Set timestamps based on status
    if (status === ORDER_STATUS.PROCESSING) {
      order.processingAt = new Date();
    } else if (status === ORDER_STATUS.SHIPPED) {
      order.shippedAt = new Date();
    } else if (status === ORDER_STATUS.DELIVERED) {
      order.deliveredAt = new Date();
    }

    // Coin Earning
    if (status === ORDER_STATUS.DELIVERED && order.orderStatus !== ORDER_STATUS.DELIVERED) {
      const earnRate = 0.1; // 10%
      const earned = Math.floor(order.totalPrice * earnRate);

      if (earned > 0) {
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        order.coinsEarned = earned;

        await User.findByIdAndUpdate(order.user, { $inc: { rewardPoints: earned } });
        await CoinLedger.create({
          user: order.user,
          amount: earned,
          type: 'earn',
          order: order._id,
          description: `Earned from Order #${order._id}`,
          expiresAt: expiresAt
        });
      }
    }

    // Update order items status if applicable
    const statusMap: Record<string, string> = {
      [ORDER_STATUS.PROCESSING]: "Processing",
      [ORDER_STATUS.SHIPPED]: "Shipped",
      [ORDER_STATUS.DELIVERED]: "Delivered",
      [ORDER_STATUS.CANCELLED]: "Cancelled",
    };

    if (statusMap[status] && order.orderItems) {
      order.orderItems.forEach((item: any) => {
        item.status = statusMap[status];
      });
    }

    order.orderStatus = status;
    await order.save({ validateBeforeSave: false });

    // Emit socket event for real-time dashboard update
    emitToAdmin(SocketEvents.ORDER_UPDATED, {
      orderId: order._id,
      orderStatus: order.orderStatus,
      deliveredAt: order.deliveredAt,
    });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'order_updated' });

    // Notify User
    await createNotification(
      String(order.user),
      'order_status',
      'Order Status Updated',
      `Your order #${order._id} is now ${status}.`,
      { orderId: order._id, status }
    );

    res.status(200).json(ApiResponse.success({ order }, "Order status updated successfully"));
  }
);

/**
 * Cancel order
 * PUT /api/orders/:id/cancel
 */
export const cancelOrder = asyncHandler(
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid order ID");
    }

    const order = await Order.findById(id);

    if (!order) {
      throw ApiError.forbidden("Order not found");
    }

    // Check authorization
    if (order.user.toString() !== req.user?._id.toString()) {
      throw ApiError.unauthorized("Not authorized to cancel this order");
    }

    // Check if order can be cancelled
    if (order.orderStatus.toLowerCase() === ORDER_STATUS.DELIVERED) {
      throw ApiError.badRequest("Cannot cancel delivered order");
    }

    if (order.orderStatus.toLowerCase() === ORDER_STATUS.CANCELLED) {
      throw ApiError.badRequest("Order already cancelled");
    }

    if (order.orderStatus.toLowerCase() === ORDER_STATUS.SHIPPED) {
      throw ApiError.badRequest(
        "Cannot cancel shipped order. Please contact support"
      );
    }

    // Restore product stock
    await restoreProductStock(order.orderItems as any);

    order.orderStatus = ORDER_STATUS.CANCELLED;
    order.cancelledAt = new Date();
    order.cancellationReason = reason || "Cancelled by user";

    // Update items status to Cancelled
    if (order.orderItems) {
      order.orderItems.forEach((item: any) => {
        item.status = "Cancelled";
      });
    }

    await order.save({ validateBeforeSave: false });

    // Emit socket event for real-time dashboard update
    emitToAdmin(SocketEvents.ORDER_UPDATED, {
      orderId: order._id,
      orderStatus: order.orderStatus,
      cancelledAt: order.cancelledAt,
    });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'order_cancelled' });

    // Notify Admins
    const userName = req.user?.name || "User";
    await notifyAdmins(
      'order_status',
      'Order Cancelled',
      `Order #${order._id} was cancelled by ${userName}.`,
      { orderId: order._id }
    );

    // Notify User (Confirmation)
    await createNotification(
      String(order.user),
      'order_status',
      'Order Cancelled',
      `Your order #${order._id} has been cancelled successfully.`,
      { orderId: order._id }
    );

    res.status(200).json(ApiResponse.success({ order }, "Order cancelled successfully"));
  }
);

/**
 * Delete order - Admin
 * DELETE /api/admin/orders/:id
 */
export const deleteOrder = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid order ID");
    }

    const order = await Order.findById(id);

    if (!order) {
      throw ApiError.notFound("Order not found");
    }

    // Only allow deletion of cancelled orders
    if (order.orderStatus.toLowerCase() !== ORDER_STATUS.CANCELLED) {
      throw ApiError.badRequest("Only cancelled orders can be deleted");
    }

    await Order.findByIdAndDelete(id);

    // Emit socket event for real-time dashboard update
    emitToAdmin(SocketEvents.ORDER_DELETED, { orderId: id });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'order_deleted' });

    res.status(200).json(ApiResponse.success(null, "Order deleted successfully"));
  }
);

/**
 * Get order statistics - Admin
 * GET /api/admin/orders/stats
 */
export const getOrderStats = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const totalOrders = await Order.countDocuments();

    const statusCounts = await Order.aggregate([
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]);

    const revenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);

    const totalRevenue = revenue.length > 0 ? revenue[0].total : 0;

    const monthlyOrders = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const stats: any = {
      totalOrders,
      totalRevenue,
      statusBreakdown: {},
      monthlyData: monthlyOrders,
    };

    statusCounts.forEach((item) => {
      stats.statusBreakdown[item._id] = item.count;
    });

    res.status(200).json(ApiResponse.success(stats));
  }
);

/**
 * Manually send order email - Admin
 * POST /api/admin/orders/:id/email
 */
export const sendOrderEmail = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid order ID");
    }

    const order = await Order.findById(id).populate("user");

    if (!order) {
      throw ApiError.notFound("Order not found");
    }

    const user = order.user as any;
    if (!user || !user.email) {
      throw ApiError.badRequest("User email not found");
    }

    await emailService.sendOrderConfirmation(user.email, user.name, String(order._id), order.totalPrice);

    res.status(200).json(ApiResponse.success(null, "Order email sent successfully"));
  }
);
