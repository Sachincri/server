import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import Stripe from "stripe";
import { Payment } from "../models/Payment.model";
import Order from "../models/Order.model";
import asyncError from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { PaymentVerificationBody, RazorpayOrderOptions } from "../types/paymentTypes";
import { AuthRequest } from "../types/index";
import { createNotification, notifyAdmins } from "./notification.controller";
import { emitToAdmin, SocketEvents } from "../config/socket";
import { finalizePaidCheckout } from "../services/checkout.service";

// Constants
const DEFAULT_CURRENCY = "INR";


// Validate Razorpay credentials on startup (optional warning)
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("Razorpay credentials missing in environment variables");
}

// Initialize Razorpay instance
let razorpayInstance: Razorpay | null = null;

const getRazorpayInstance = (): Razorpay => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      // configuration missing -> internal server error
      throw ApiError.internal("Razorpay configuration missing");
    }

    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpayInstance;
};

// Helper to validate payment signature
const validatePaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw ApiError.internal("Payment configuration error: Secret key missing.");
  }

  const body = `${orderId}|${paymentId}`;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
};

const generateReceiptId = (): string => {
  return `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
};

// Controllers

/**
 * Initiates a new Razorpay order.
 * The amount is determined server-side from the user's cart for security.
 */
export const createRazorpayOrder = asyncError(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?._id;
    const validation = req.orderValidation;

    if (!validation) {
      throw ApiError.internal("Failed to validate order details.");
    }

    const { finalAmount } = validation;
    const amountInPaise = Math.round(finalAmount * 100);

    const razorpay = getRazorpayInstance();

    const options: RazorpayOrderOptions = {
      amount: amountInPaise,
      currency: DEFAULT_CURRENCY,
      receipt: generateReceiptId(),
      notes: {
        userId: userId,
        userName: req.user?.name,
      },
    };

    const order = await razorpay.orders.create(options);

    if (!order) {
      throw ApiError.internal("Razorpay order creation failed.");
    }

    res.status(201).json(ApiResponse.created({ order }));
  }
);

/**
 * Verifies the payment signature and finalizes the order.
 * This process is atomic and ensures the paid amount matches the server's calculation.
 */
export const paymentVerification = asyncError(
  async (req: AuthRequest, res: Response) => {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderOptions,
    } = req.body as PaymentVerificationBody;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      throw ApiError.badRequest("Incomplete payment verification data.");
    }

    // Verify the authenticity of the payment
    const isAuthentic = validatePaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isAuthentic) {
      await Payment.create({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount: 0,
        currency: "INR",
        status: "failed",
        failureReason: "Signature verification failed",
      });
      throw ApiError.badRequest("Security check failed: Invalid payment signature.");
    }

    const validation = req.orderValidation;
    if (!validation) {
      throw ApiError.internal("Order validation context missing.");
    }

    const finalAmount = validation.finalAmount;

    // Fetch payment details directly from Razorpay to cross-verify the amount
    const razorpay = getRazorpayInstance();
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id) as any;

    if (paymentDetails.status !== "captured" && paymentDetails.status !== "authorized") {
      throw ApiError.badRequest(`Payment unsuccessful. Current status: ${paymentDetails.status}`);
    }

    const expectedAmountPaise = Math.round(finalAmount * 100);
    if (paymentDetails.amount !== expectedAmountPaise) {
      throw ApiError.badRequest("Payment amount mismatch. Please contact support.");
    }

    const { order: newOrder, payment, idempotent } = await finalizePaidCheckout({
      userId: req.user?._id,
      userName: req.user?.name,
      userEmail: req.user?.email,
      validation,
      shippingInfo: orderOptions?.shippingInfo || {},
      payment: {
        provider: "razorpay",
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount: paymentDetails.amount / 100,
        currency: paymentDetails.currency,
        method: paymentDetails.method,
        email: paymentDetails.email,
        contact: paymentDetails.contact,
      },
    });

    if (!idempotent) {
      const userId = String(req.user?._id);
      const orderId = String(newOrder._id);

      await createNotification(
        userId,
        'order_status',
        'Order Confirmed! ✅',
        `Your order #${orderId.slice(-6)} has been placed successfully. Total: ₹${finalAmount}`,
        { orderId, status: 'Ordered' }
      );

      // Notify Admins
      await notifyAdmins(
        'system_alert',
        'New Paid Order 💰',
        `New order #${orderId.slice(-6)} placed by ${req.user?.name || 'User'} for ₹${finalAmount}.`,
        { orderId }
      );

      // Socket events for admin dashboard
      emitToAdmin(SocketEvents.ORDER_CREATED, {
        orderId: newOrder._id,
        totalPrice: finalAmount,
        orderStatus: 'Ordered',
        createdAt: new Date(),
      });
      emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'order_created' });
    }

    const payload = { orderId: newOrder._id, paymentId: payment._id };
    if (idempotent) {
      return res.status(200).json(ApiResponse.success(payload, "Order already placed for this payment."));
    }
    return res.status(201).json(ApiResponse.created(payload, "Order placed successfully."));
  }
);

/**
 * Retrieves the Razorpay public key for the frontend.
 */
export const getRazorpayKey = asyncError(
  async (_req: Request, res: Response) => {
    if (!process.env.RAZORPAY_KEY_ID) {
      throw ApiError.internal("Razorpay configuration missing.");
    }

    res.status(200).json(ApiResponse.success({ key: process.env.RAZORPAY_KEY_ID }));
  }
);

/**
 * Fetches details for a specific payment and its associated order.
 */
export const getPaymentDetails = asyncError(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw ApiError.badRequest("Invalid payment identifier.");
    }

    const payment = await Payment.findById(id);

    if (!payment) {
      throw ApiError.notFound("Payment record not found.");
    }

    const order = await Order.findOne({ "paymentInfo.id": payment._id });

    // Ensure users can only view their own payments
    if (!order) {
      throw ApiError.notFound("Associated order not found.");
    }
    if (order.user.toString() !== req.user?._id.toString() && req.user?.role !== "admin") {
      throw ApiError.forbidden("Access denied.");
    }

    res.status(200).json(ApiResponse.success({
      payment,
      order: order ? { _id: order._id, orderStatus: order.orderStatus } : null,
    }));
  }
);

/**
 * Handles asynchronous event notifications (webhooks) from Razorpay.
 */
export const handlePaymentWebhook = asyncError(
  async (req: Request, res: Response) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      throw ApiError.internal("Webhook configuration missing.");
    }

    const signature = req.headers["x-razorpay-signature"] as string;

    if (!signature) {
      throw ApiError.badRequest("Missing webhook signature.");
    }

    if (!(req as any).rawBody) {
      throw ApiError.badRequest("Verification requires the raw request body.");
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update((req as any).rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      throw ApiError.badRequest("Webhook security check failed.");
    }

    const { event, payload } = req.body;

    switch (event) {
      case "payment.captured": {
        const paymentEntity = payload.payment.entity;
        await Payment.findOneAndUpdate(
          { razorpay_payment_id: paymentEntity.id },
          {
            status: "success",
            capturedAt: new Date(),
          }
        );
        break;
      }

      case "payment.failed": {
        const failedPayment = payload.payment.entity;
        await Payment.findOneAndUpdate(
          { razorpay_payment_id: failedPayment.id },
          {
            status: "failed",
            failureReason: failedPayment.error_description,
          }
        );
        break;
      }

      default:
        // Other events can be logged if necessary for auditing
        break;
    }

    res.status(200).json(ApiResponse.success(null));
  }
);

/**
 * Processes a refund request via the Razorpay API. (Admin Only)
 */
export const refundPayment = asyncError(
  async (req: Request, res: Response) => {
    try {
      const { paymentId, amount, reason } = req.body;

      if (!paymentId) {
        throw ApiError.badRequest("Payment reference is required.");
      }

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        throw ApiError.notFound("Payment record not found.");
      }

      const status = payment.status.toLowerCase();
      if (!["success", "succeeded", "captured"].includes(status)) {
        throw ApiError.badRequest(`Refund unavailable for payments in status: ${payment.status}`);
      }

      if (payment.refunded) {
        throw ApiError.conflict("This payment has already been refunded.");
      }

      let refund;
      let calculatedRefundAmount = amount ? Math.round(amount * 100) / 100 : 0;

      if (payment.provider === "stripe" || payment.stripe_payment_intent_id) {
        // Stripe Refund Logic
        try {
          const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
          if (!stripeSecretKey) {
            throw ApiError.internal("Stripe secret key missing in environment.");
          }
          const stripe = new Stripe(stripeSecretKey, {
            apiVersion: '2026-01-28.clover' as any,
          });

          const piId = payment.stripe_payment_intent_id || payment.razorpay_payment_id;
          if (!piId) throw ApiError.badRequest("Stripe transaction ID missing.");

          const refundOptions: Stripe.RefundCreateParams = {
            payment_intent: piId,
            reason: 'requested_by_customer',
            metadata: {
              adminReason: (reason || "Admin initiated refund").substring(0, 255),
              originalPaymentId: piId
            }
          };

          if (amount) {
            refundOptions.amount = Math.round(amount * 100);
          }

          refund = await stripe.refunds.create(refundOptions);
          calculatedRefundAmount = refund.amount / 100;
        } catch (stripeError: any) {
          console.error("Stripe refund processing error:", stripeError);
          const description = stripeError.message || "Refund failed via Stripe API.";
          throw ApiError.badRequest(`Stripe: ${description}`);
        }
      } else {
        // Razorpay Logic
        const razorpay = getRazorpayInstance();

        if (!payment.razorpay_payment_id) {
          throw ApiError.badRequest("External payment reference missing.");
        }

        // Sync state
        let rzpPayment;
        try {
          rzpPayment = await razorpay.payments.fetch(payment.razorpay_payment_id.trim()) as any;
        } catch (fetchError: any) {
          throw ApiError.badRequest(`Razorpay sync error: ${fetchError.error?.description || fetchError.message}`);
        }

        const balanceAvailable = rzpPayment.amount - (rzpPayment.amount_refunded || 0);

        if (rzpPayment.status !== "captured") {
          // If already refunded, update local state and notify admin
          if (rzpPayment.status === "refunded") {
            payment.refunded = true;
            payment.status = "refunded";
            await payment.save({ validateBeforeSave: false });
            throw ApiError.badRequest("This payment has already been refunded on Razorpay.");
          }
          throw ApiError.badRequest(`Refund requires 'captured' status, but current status is '${rzpPayment.status}'.`);
        }

        const rzpRefundAmount = amount ? Math.round(amount * 100) : balanceAvailable;

        if (rzpRefundAmount <= 0) throw ApiError.badRequest("No refundable balance remaining.");
        if (rzpRefundAmount > balanceAvailable) throw ApiError.badRequest(`Amount exceeds balance. Available: ${balanceAvailable / 100}`);

        try {
          const refundOptions: any = {
            amount: rzpRefundAmount,
            notes: {
              reason: (reason || "Admin initiated refund").substring(0, 255),
              adminAction: "true"
            }
          };

          // Revert to the standard payments.refund API for compatibility
          refund = await razorpay.payments.refund(payment.razorpay_payment_id.trim(), refundOptions);
          calculatedRefundAmount = rzpRefundAmount / 100;
        } catch (rzpError: any) {
          console.error("RAZORPAY REFUND ERROR DETAILS:", JSON.stringify(rzpError, null, 2));
          const description = rzpError.error?.description || rzpError.message || "Invalid request sent to Razorpay.";
          throw ApiError.badRequest(`Razorpay: ${description}`);
        }
      }

      // 3. Update local records (Common for both)
      payment.refunded = true;
      payment.refundId = refund.id;
      payment.refundAmount = calculatedRefundAmount;
      payment.refundedAt = new Date();
      payment.status = "refunded";
      await payment.save({ validateBeforeSave: false });

      const order = await Order.findOne({ "paymentInfo.id": String(payment._id) });
      if (order) {
        order.orderStatus = "Returned";
        order.paymentInfo.status = "refunded";
        await order.save({ validateBeforeSave: false });

        // Notify User about Refund
        await createNotification(
          String(order.user),
          'refund_update',
          'Refund Processed 💰',
          `A refund of ₹${calculatedRefundAmount} has been processed for order #${String(order._id).slice(-6)}.`,
          { orderId: order._id }
        );
      }

      res.status(200).json(ApiResponse.success({ refund }, "Payment refunded successfully."));
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw ApiError.badRequest(error.message || "An error occurred during the refund process.");
    }
  }
);

/**
 * Get payment statistics - Admin
 * GET /api/admin/payment/stats
 */
export const getPaymentStats = asyncError(
  async (_req: Request, res: Response) => {
    const [
      totalPayments,
      successfulPayments,
      failedPayments,
      totalRevenue,
      refundStats,
    ] = await Promise.all([
      Payment.countDocuments(),
      Payment.countDocuments({ status: "success" }),
      Payment.countDocuments({ status: "failed" }),
      Payment.aggregate([
        { $match: { status: "success", refunded: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        { $match: { refunded: true } },
        {
          $group: {
            _id: null,
            totalRefunded: { $sum: "$refundAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      totalPayments,
      successfulPayments,
      failedPayments,
      successRate:
        totalPayments > 0
          ? Math.round((successfulPayments / totalPayments) * 100)
          : 0,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalRefunded: refundStats[0]?.totalRefunded || 0,
      refundCount: refundStats[0]?.count || 0,
      netRevenue:
        (totalRevenue[0]?.total || 0) - (refundStats[0]?.totalRefunded || 0),
    };

    res.status(200).json(ApiResponse.success(stats));
  }
);
