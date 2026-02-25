
import { Request, Response, NextFunction } from "express";
import { Cart } from "../models/Cart.model";
import Coupon from "../models/Coupon.model";
import Settings from "../models/Settings.model";
import User from "../models/User.model";
import ApiError from "../utils/apiError";
import asyncHandler from "./asyncHandler";
import { calculateOrderTotals } from "../utils/order.utils";
// import { OrderValidationResult } from "../types/orderTypes";

/**
 * Middleware to validate order pricing including coupons and coins
 */
export const validateOrderPrice = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        // 1. Fetch Cart (Source of Truth)
        // Assuming authenticated user - req.user._id exists (handled by protect middleware)
        const userId = (req as any).user?._id;
        if (!userId) {
            throw ApiError.unauthorized("User not authenticated");
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart || cart.items.length === 0) {
            throw ApiError.badRequest("Cart is empty");
        }

        // 2. Base Calculation
        let itemsPrice = 0;
        cart.items.forEach((item: any) => {
            itemsPrice += item.sellingPrice * item.quantity;
        });



        let { shippingCharges, totalAmount } = calculateOrderTotals(itemsPrice);

        const settings = await Settings.findOne();

        // Check for custom shipping charges/threshold from settings
        if (settings) {
            const freeDeliveryThreshold = settings.freeDeliveryThreshold ?? 500;
            const deliveryCharges = settings.deliveryCharges ?? 40;
            shippingCharges = itemsPrice > freeDeliveryThreshold ? 0 : deliveryCharges;
            totalAmount = itemsPrice + shippingCharges;
        }



        let finalAmount = totalAmount;
        let couponDiscount = 0;
        let coinsToRedeem = 0;

        // 3. Apply Coins
        // 3. Apply Coupon (First priority)
        let foundCoupon = null;
        if (cart.couponCode) {
            const code = cart.couponCode.toString().toUpperCase();
            foundCoupon = await Coupon.findOne({
                code: code,
                isActive: true,
                expiryDate: { $gt: new Date() },
                startDate: { $lte: new Date() },
            });

            if (foundCoupon) {
                // Check usage limit
                if (foundCoupon.usageLimit !== null && (foundCoupon.usageLimit !== undefined) && foundCoupon.usedCount >= foundCoupon.usageLimit) {
                    // throw ApiError.badRequest("Coupon usage limit exceeded");
                    // Instead of throwing, just ignore it for calculation to prevent blocking Order
                    foundCoupon = null;
                } else if (totalAmount < foundCoupon.minPurchaseAmount) {
                    // throw ApiError.badRequest(`Minimum purchase amount of ₹${foundCoupon.minPurchaseAmount} required`);
                    foundCoupon = null;
                } else {
                    // Calculate discount
                    if (foundCoupon.discountType === 'percentage') {
                        couponDiscount = Math.round((totalAmount * foundCoupon.discountAmount) / 100);
                        if (foundCoupon.maxDiscountAmount) {
                            couponDiscount = Math.min(couponDiscount, foundCoupon.maxDiscountAmount);
                        }
                    } else {
                        couponDiscount = foundCoupon.discountAmount;
                    }

                    // Ensure discount doesn't exceed total
                    if (couponDiscount > finalAmount) {
                        couponDiscount = finalAmount;
                    }

                    finalAmount -= couponDiscount;

                }
            }
        }

        // 4. Apply Coins (Second priority)
        if (cart.isCoinsRedeemed) {
            const user = await User.findById(userId);
            if (!user) throw ApiError.notFound("User not found");

            const settings = await Settings.findOne();
            const maxPercentage = settings?.maxCoinUsagePercentage || 20;
            const availableCoins = user.rewardPoints || 0;
            const coinValue = settings?.coinValue || 1;

            const amountAfterCoupon = finalAmount;
            const orderLimitInCoins = Math.floor((amountAfterCoupon * maxPercentage) / 100);

            const eligibleCoins = Math.min(availableCoins, orderLimitInCoins);
            coinsToRedeem = eligibleCoins * coinValue;

            // Cap at current final amount (after coupon)
            coinsToRedeem = Math.min(coinsToRedeem, finalAmount);
            finalAmount -= coinsToRedeem;


        }




        // Attach results to Request object
        req.orderValidation = {
            cart,
            itemsPrice,
            shippingCharges,
            totalAmountBeforeDiscount: totalAmount,
            finalAmount, // This is the amount the user must pay (via Gateway or COD)
            couponDiscount,
            redeemCoins: coinsToRedeem,
            couponCode: foundCoupon?.code,
            coupon: foundCoupon
        };

        next();
    }
);
