import { Response } from "express";
import Stripe from "stripe";
import Settings from "../models/Settings.model";
import User from "../models/User.model";
import asyncError from "../middleware/asyncHandler";
import emailService from "../services/email.Service";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { AuthRequest } from "../types/index";
import { finalizePaidCheckout } from "../services/checkout.service";

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

        const validation = req.orderValidation;
        if (!validation) {
            throw ApiError.internal("Failed to validate order details.");
        }

        const amountInSmallestUnit = Math.round(validation.finalAmount * 100);

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
            description: `Payment for ${validation.cart.items.length} items by ${req.user?.name}`,
            shipping,
            metadata: {
                userId: userId.toString(),
                cartId: String(validation.cart._id),
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

    const validation = req.orderValidation;
    if (!validation) {
        throw ApiError.internal("Order validation context missing.");
    }

    const expectedAmount = Math.round(validation.finalAmount * 100);
    if (paymentIntent.amount !== expectedAmount) {
        throw ApiError.badRequest("Payment amount mismatch. Please contact support.");
    }

    const { order: newOrder, payment, idempotent } = await finalizePaidCheckout({
        userId,
        userName: req.user?.name,
        userEmail: req.user?.email,
        validation,
        shippingInfo: orderOptions?.shippingInfo || {},
        payment: {
            provider: "stripe",
            stripe_payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            method: "stripe",
            email: req.user?.email || "",
        },
    });

    if (!idempotent) {
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
    }

    const payload = {
        orderId: newOrder._id,
        paymentId: payment._id
    };
    if (idempotent) {
        return res.status(200).json(ApiResponse.success(payload, "Order already placed for this payment"));
    }
    return res.status(201).json(ApiResponse.created(payload, "Order placed successfully"));
});

