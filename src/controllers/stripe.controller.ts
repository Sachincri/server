import { Response } from "express";
import { startSession } from "mongoose";
import Stripe from "stripe";
import { Payment } from "../models/Payment.model";
import Order from "../models/Order.model";
import Settings from "../models/Settings.model";
// import CoinLedger from "../models/CoinLedger.model";
import User from "../models/User.model";
import asyncError from "../middleware/asyncHandler";
import emailService from "../services/email.Service";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { Cart } from "../models/Cart.model";
import { calculateOrderTotals } from "../utils/order.utils";
import { AuthRequest } from "../types/index";

// Types
interface StripeVerifyBody {
    paymentIntentId: string;
    orderOptions: any;
}

const getStripeInstance = async (): Promise<Stripe> => {
    const settings = await Settings.findOne().sort({ createdAt: -1 });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!settings || !settings.stripeEnabled || !stripeSecretKey) {
        throw ApiError.badRequest("Stripe payments are not currently enabled or configured correctly in server environment.");
    }
    return new Stripe(stripeSecretKey, {
        apiVersion: '2026-01-28.clover' as any,
    });
};

/**
 * Create Stripe Payment Intent
 * POST /api/payment/stripe/create-intent
 */
export const createStripePaymentIntent = asyncError(
    async (req: AuthRequest, res: Response) => {
        const userId = req.user?._id;
        if (!userId) {
            throw ApiError.unauthorized("User not logged in");
        }

        const { shippingInfo } = req.body;

        const cart = await Cart.findOne({ user: userId });

        if (!cart || cart.items.length === 0) {
            throw ApiError.badRequest("Cart is empty");
        }

        const { totalAmount } = calculateOrderTotals(cart.subtotal);
        const amountInSmallestUnit = Math.round(totalAmount * 100); // Cents/Paise

        const stripe = await getStripeInstance();

        const shipping = shippingInfo ? {
            name: `${shippingInfo.firstName || ''} ${shippingInfo.lastName || ''}`.trim() || req.user?.name || "Customer",
            address: {
                line1: shippingInfo.address,
                city: shippingInfo.city,
                state: shippingInfo.state,
                postal_code: shippingInfo.pinCode?.toString(),
                country: shippingInfo.country || "IN",
            }
        } : {
            name: req.user?.name || "Customer",
            address: {
                line1: "Not provided",
                country: "IN",
            }
        };

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInSmallestUnit,
            currency: 'inr', // Or fetch from settings
            automatic_payment_methods: {
                enabled: true,
            },
            description: `Payment for ${cart.items.length} items by ${req.user?.name}`,
            shipping,
            metadata: {
                userId: userId.toString(),
                cartId: String(cart._id),
            },
        });

        res.status(200).json(ApiResponse.success({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        }));
    }
);

/**
 * Verify Stripe Payment
 * POST /api/payment/stripe/verify
 */
export const verifyStripePayment = asyncError(async (req: AuthRequest, res: Response) => {
    const { paymentIntentId, orderOptions } = req.body as StripeVerifyBody;
    const userId = req.user?._id;

    if (!userId) {
        throw ApiError.unauthorized("User not logged in");
    }

    if (!paymentIntentId) {
        throw ApiError.badRequest("Payment Intent ID is required");
    }

    const stripe = await getStripeInstance();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
        throw ApiError.badRequest(`Payment not successful. Status: ${paymentIntent.status}`);
    }

    const cart = await Cart.findOne({ user: userId });

    // Check for duplicate payment record first
    const existingPayment = await Payment.findOne({ stripe_payment_intent_id: paymentIntentId });
    if (existingPayment) {
        return res.status(200).json(ApiResponse.success({ orderId: null, message: "Payment already recorded" }));
    }

    if (!cart || cart.items.length === 0) {
        throw ApiError.badRequest("Cart not found or empty. Cannot process order for this payment.");
    }

    const { itemsPrice, shippingCharges, totalAmount } = calculateOrderTotals(cart.subtotal);

    // Verify Amount
    const expectedAmount = Math.round(totalAmount * 100);
    if (paymentIntent.amount !== expectedAmount) {
        console.error(`Stripe Amount Mismatch: Expected ${expectedAmount}, Got ${paymentIntent.amount}`);
    }

    const session = await startSession();
    session.startTransaction();

    try {
        const [payment] = await Payment.create([{
            stripe_payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            status: "success",
            method: "stripe",
            provider: "stripe",
            email: req.user?.email || "",
            capturedAt: new Date(),
        }], { session });

        const [newOrder] = await Order.create([{
            shippingInfo: orderOptions?.shippingInfo || {},
            orderItems: cart.items.map(item => ({
                product: item.product,
                name: item.productName,
                sellingPrice: item.sellingPrice,
                image: item.productImage,
                quantity: item.quantity,
                size: item.variant?.size,
                color: item.variant?.color,
                status: "Processing"
            })),
            user: userId,
            paidAt: new Date(),
            itemsPrice,
            taxPrice: 0,
            shippingPrice: shippingCharges,
            totalPrice: totalAmount,
            paymentInfo: {
                id: String(payment._id),
                status: "success",
                method: "stripe",
            },
            orderStatus: "Placed",
        }], { session });

        // Clear Cart
        cart.items = [];
        cart.subtotal = 0;
        cart.total = 0;
        cart.totalDiscount = 0;
        cart.itemCount = 0;
        await cart.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Background tasks (Post-payment)
        try {
            const settings = await Settings.findOne();
            if (settings && settings.orderEmailEnabled) {
                const user = await User.findById(userId);
                if (user) {
                    await emailService.sendOrderConfirmation(user.email, user.name, String(newOrder._id), newOrder.totalPrice, newOrder.orderItems);
                }
            }
        } catch (emailError: any) {
            console.error("Failed to send order email:", emailError.message);
        }

        return res.status(201).json(ApiResponse.created({
            orderId: newOrder._id,
            paymentId: payment._id
        }, "Order placed successfully"));

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
});

