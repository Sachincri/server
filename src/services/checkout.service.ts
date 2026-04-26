import { ClientSession, startSession } from "mongoose";
import Order from "../models/Order.model";
import Product from "../models/Product.model";
import User from "../models/User.model";
import Coupon from "../models/Coupon.model";
import CoinLedger from "../models/CoinLedger.model";
import { Cart } from "../models/Cart.model";
import { Payment } from "../models/Payment.model";
import ApiError from "../utils/apiError";
import { OrderValidationResult } from "../types/orderTypes";

type PaymentProvider = "razorpay" | "stripe";

interface PaymentRecordInput {
  provider: PaymentProvider;
  amount: number;
  currency: string;
  method?: string;
  email?: string;
  contact?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  stripe_payment_intent_id?: string;
}

interface FinalizeCheckoutInput {
  userId: any;
  userName?: string;
  userEmail?: string;
  validation: OrderValidationResult;
  shippingInfo: any;
  payment: PaymentRecordInput;
}

interface FinalizeCheckoutResult {
  order: any;
  payment: any;
  idempotent: boolean;
}

const getExistingPaymentFilter = (payment: PaymentRecordInput) => {
  if (payment.provider === "stripe") {
    return { stripe_payment_intent_id: payment.stripe_payment_intent_id };
  }
  return { razorpay_payment_id: payment.razorpay_payment_id };
};

const findExistingCheckout = async (payment: PaymentRecordInput): Promise<FinalizeCheckoutResult | null> => {
  const filter = getExistingPaymentFilter(payment);
  const existingPayment = await Payment.findOne(filter);
  if (!existingPayment) return null;

  const existingOrder = await Order.findOne({ "paymentInfo.id": String(existingPayment._id) });
  if (!existingOrder) {
    throw ApiError.conflict("Payment is already recorded but the order could not be found. Please contact support.");
  }

  return { order: existingOrder, payment: existingPayment, idempotent: true };
};

const withSession = <T extends { session: (session: ClientSession) => T }>(
  query: T,
  session?: ClientSession
): T => {
  return session ? query.session(session) : query;
};

const buildShippingInfo = (shippingInfo: any, userName?: string, userEmail?: string) => ({
  ...shippingInfo,
  firstName: shippingInfo?.firstName || shippingInfo?.name || userName || "Customer",
  lastName: shippingInfo?.lastName || "",
  email: shippingInfo?.email || userEmail || "",
});

const buildServerOrderItems = async (cart: any, session?: ClientSession) => {
  const productIds = cart.items.map((item: any) => item.product);
  const products = await withSession(
    Product.find({ _id: { $in: productIds } }).select("name sellingPrice actualPrice weight stock isActive images"),
    session
  );
  const productMap = new Map(products.map((product: any) => [product._id.toString(), product]));

  return cart.items.map((item: any) => {
    const product = productMap.get(item.product.toString());
    if (!product) {
      throw ApiError.badRequest(`Product not found: ${item.productName || item.product}`);
    }
    if (!product.isActive) {
      throw ApiError.badRequest(`${product.name} is no longer available`);
    }
    if (product.stock < item.quantity) {
      throw ApiError.badRequest(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    }
    if (Math.abs(product.sellingPrice - item.sellingPrice) > 0.01) {
      throw ApiError.badRequest(`Price mismatch for ${product.name}. Please sync your cart.`);
    }

    return {
      product: item.product,
      name: item.productName,
      sellingPrice: item.sellingPrice,
      actualPrice: product.actualPrice,
      image: item.productImage,
      weight: product.weight || 0.5,
      quantity: item.quantity,
      size: item.variant?.size,
      color: item.variant?.color,
      status: "Ordered",
    };
  });
};

const decrementStock = async (orderItems: any[], session?: ClientSession): Promise<void> => {
  for (const item of orderItems) {
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true, session: session || undefined }
    );

    if (!updatedProduct) {
      const product = await withSession(Product.findById(item.product), session);
      throw ApiError.badRequest(
        product
          ? `Sorry, another customer just bought the last stock for ${product.name}. Available: ${product.stock}`
          : "Product not found"
      );
    }
  }
};

const applyCoins = async (input: FinalizeCheckoutInput, orderId: any, session?: ClientSession): Promise<void> => {
  const coinsToRedeem = input.validation.redeemCoins || 0;
  if (coinsToRedeem <= 0) return;

  const updatedUser = await User.findOneAndUpdate(
    { _id: input.userId, rewardPoints: { $gte: coinsToRedeem } },
    { $inc: { rewardPoints: -coinsToRedeem } },
    { new: true, session: session || undefined }
  );

  if (!updatedUser) {
    throw ApiError.badRequest("Insufficient reward points");
  }

  await CoinLedger.create([{
    user: input.userId,
    amount: -coinsToRedeem,
    type: "redeem",
    order: orderId,
    description: `Redeemed on order #${orderId}`,
    createdAt: new Date(),
  }], { session: session || undefined });
};

const applyCouponUsage = async (validation: OrderValidationResult, session?: ClientSession): Promise<void> => {
  if (!validation.coupon) return;

  const result = await Coupon.updateOne(
    {
      _id: validation.coupon._id,
      $or: [
        { usageLimit: null },
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
      ],
    },
    { $inc: { usedCount: 1 } },
    { session: session || undefined }
  );

  if (result.modifiedCount === 0) {
    throw ApiError.badRequest("Coupon usage limit exceeded");
  }
};

const finalizeInSession = async (
  input: FinalizeCheckoutInput,
  session?: ClientSession
): Promise<FinalizeCheckoutResult> => {
  if (Math.abs(input.payment.amount - input.validation.finalAmount) > 0.01) {
    throw ApiError.badRequest("Payment amount mismatch. Please contact support.");
  }

  const cart = await withSession(Cart.findOne({ user: input.userId }), session);
  if (!cart || cart.items.length === 0) {
    throw ApiError.badRequest("Cart is empty");
  }

  const serverOrderItems = await buildServerOrderItems(cart, session);
  await decrementStock(serverOrderItems, session);

  const [payment] = await Payment.create([{
    ...input.payment,
    status: "success",
    capturedAt: new Date(),
  }], { session: session || undefined });

  const [order] = await Order.create([{
    shippingInfo: buildShippingInfo(input.shippingInfo, input.userName, input.userEmail),
    orderItems: serverOrderItems,
    user: input.userId,
    itemsPrice: input.validation.itemsPrice,
    shippingPrice: input.validation.shippingCharges,
    totalPrice: input.validation.finalAmount,
    redeemCoins: input.validation.redeemCoins,
    paidAt: new Date(),
    coupon: input.validation.couponCode
      ? { code: input.validation.couponCode, discount: input.validation.couponDiscount }
      : undefined,
    paymentInfo: {
      id: String(payment._id),
      status: "success",
      method: input.payment.method || input.payment.provider,
    },
    orderStatus: "Ordered",
  }], { session: session || undefined });

  await applyCoins(input, order._id, session);
  await applyCouponUsage(input.validation, session);

  cart.items = [];
  cart.couponCode = undefined;
  cart.isCoinsRedeemed = false;
  await cart.save({ session: session || undefined });

  return { order, payment, idempotent: false };
};

export const finalizePaidCheckout = async (input: FinalizeCheckoutInput): Promise<FinalizeCheckoutResult> => {
  const existing = await findExistingCheckout(input.payment);
  if (existing) return existing;

  const session = await startSession();
  let inTransaction = false;

  try {
    session.startTransaction();
    inTransaction = true;
  } catch {
    inTransaction = false;
  }

  try {
    const result = await finalizeInSession(input, inTransaction ? session : undefined);
    if (inTransaction) {
      await session.commitTransaction();
    }
    return result;
  } catch (error: any) {
    if (error?.code === 11000) {
      const existingAfterRace = await findExistingCheckout(input.payment);
      if (existingAfterRace) return existingAfterRace;
    }
    if (inTransaction) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
};
