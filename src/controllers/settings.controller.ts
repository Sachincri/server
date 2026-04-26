import { Request, Response } from "express";
import Settings from "../models/Settings.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiResponse from "../utils/response";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS, CACHE_TTL } from "../config/redis";

export const toPublicSettings = (settings: any) => {
    const source = typeof settings?.toObject === "function" ? settings.toObject() : settings;

    return {
        codMinimumAmount: source.codMinimumAmount,
        codEnabled: source.codEnabled,
        deliveryCharges: source.deliveryCharges,
        freeDeliveryThreshold: source.freeDeliveryThreshold,
        termsAndConditions: source.termsAndConditions,
        coinEarnRate: source.coinEarnRate,
        coinValue: source.coinValue,
        maxCoinUsagePercentage: source.maxCoinUsagePercentage,
        coinExpiryDays: source.coinExpiryDays,
        helpLineNumber: source.helpLineNumber,
        supportEmail: source.supportEmail,
        orderEmailEnabled: source.orderEmailEnabled,
        stripeEnabled: source.stripeEnabled,
        aiChatEnabled: source.aiChatEnabled,
        aiSuggestionsEnabled: source.aiSuggestionsEnabled,
        emailEnabled: source.emailEnabled,
        siteBackgroundGradient: source.siteBackgroundGradient,
        googleAnalyticsEnabled: source.googleAnalyticsEnabled,
        cancellationPolicy: source.cancellationPolicy,
        refundPolicy: source.refundPolicy,
        aiCallReviewCollectionEnabled: source.aiCallReviewCollectionEnabled,
        aiReviewCondition: source.aiReviewCondition,
        aiReviewRewardType: source.aiReviewRewardType,
        aiReviewRewardValue: source.aiReviewRewardValue,
        whatsappSupportEnabled: source.whatsappSupportEnabled,
        taxEnabled: source.taxEnabled,
        taxRate: source.taxRate,
        gstRate: source.gstRate,
        gatewayFeeRate: source.gatewayFeeRate,
        shippingProvider: source.shippingProvider,
        defaultBoxLength: source.defaultBoxLength,
        defaultBoxBreadth: source.defaultBoxBreadth,
        defaultBoxHeight: source.defaultBoxHeight,
        defaultBoxWeight: source.defaultBoxWeight,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    };
};

/**
 * Get current settings
 * GET /api/v1/admin/settings
 */
export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
        // Create default settings if none exist
        settings = await Settings.create({});
    }

    res.status(200).json(ApiResponse.success({
        settings: {
            ...(settings as any).toObject(),
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ""
        }
    }));
});

/**
 * Update settings
 * PUT /api/v1/admin/settings
 */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const {
        codMinimumAmount,
        codEnabled,
        deliveryCharges,
        freeDeliveryThreshold,
        termsAndConditions,
        coinEarnRate,
        coinValue,
        helpLineNumber,
        supportEmail,
        stripeEnabled,
        emailService,
    } = req.body;

    let settings = await Settings.findOne().sort({ createdAt: -1 });

    const updateData = {
        codMinimumAmount: codMinimumAmount !== undefined ? Number(codMinimumAmount) : undefined,
        codEnabled: codEnabled !== undefined ? Boolean(codEnabled) : undefined,
        deliveryCharges: deliveryCharges !== undefined ? Number(deliveryCharges) : undefined,
        freeDeliveryThreshold: freeDeliveryThreshold !== undefined ? Number(freeDeliveryThreshold) : undefined,
        termsAndConditions: termsAndConditions !== undefined ? String(termsAndConditions) : undefined,
        coinEarnRate: coinEarnRate !== undefined ? Number(coinEarnRate) : undefined,
        coinValue: coinValue !== undefined ? Number(coinValue) : undefined,
        maxCoinUsagePercentage: req.body.maxCoinUsagePercentage !== undefined ? Number(req.body.maxCoinUsagePercentage) : undefined,
        coinExpiryDays: req.body.coinExpiryDays !== undefined ? Number(req.body.coinExpiryDays) : undefined,
        helpLineNumber: helpLineNumber !== undefined ? String(helpLineNumber) : undefined,
        supportEmail: supportEmail !== undefined ? String(supportEmail) : undefined,
        stripeEnabled: stripeEnabled !== undefined ? Boolean(stripeEnabled) : undefined,
        brevoApiKey: req.body.brevoApiKey !== undefined ? String(req.body.brevoApiKey) : undefined,
        orderEmailEnabled: req.body.orderEmailEnabled !== undefined ? Boolean(req.body.orderEmailEnabled) : undefined,
        emailService: emailService !== undefined ? String(emailService) : undefined,
        emailEnabled: req.body.emailEnabled !== undefined ? Boolean(req.body.emailEnabled) : undefined,
        siteBackgroundGradient: req.body.siteBackgroundGradient !== undefined ? String(req.body.siteBackgroundGradient) : undefined,
        googleAnalyticsEnabled: req.body.googleAnalyticsEnabled !== undefined ? Boolean(req.body.googleAnalyticsEnabled) : undefined,
        aiChatEnabled: req.body.aiChatEnabled !== undefined ? Boolean(req.body.aiChatEnabled) : undefined,
        aiSuggestionsEnabled: req.body.aiSuggestionsEnabled !== undefined ? Boolean(req.body.aiSuggestionsEnabled) : undefined,
        taxEnabled: req.body.taxEnabled !== undefined ? Boolean(req.body.taxEnabled) : undefined,
        gstRate: req.body.gstRate !== undefined ? Number(req.body.gstRate) : undefined,
        gatewayFeeRate: req.body.gatewayFeeRate !== undefined ? Number(req.body.gatewayFeeRate) : undefined,
        // @ts-ignore
        updatedBy: req.user?._id,
    };

    // Remove undefined values
    Object.keys(updateData).forEach(
        (key) => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]
    );

    if (settings) {
        settings = await Settings.findByIdAndUpdate(settings._id, updateData, {
            new: true,
            runValidators: true,
        });
    } else {
        settings = await Settings.create(updateData);
    }

    // Invalidate settings cache
    await cacheDel(CACHE_KEYS.SETTINGS);

    res.status(200).json(ApiResponse.success({ settings }, "Settings updated successfully"));
});

/**
 * Get settings for public (client side)
 * GET /api/v1/home/settings
 */
export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
    // ── Redis cache check ──
    const cached = await cacheGet(CACHE_KEYS.SETTINGS);
    if (cached) {
        res.set("X-Cache", "HIT");
        return res.status(200).json(ApiResponse.success({ settings: toPublicSettings(cached) }));
    }

    let settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
        settings = await Settings.create({});
    }

    const settingsData = toPublicSettings(settings);

    // Cache for 10 minutes
    await cacheSet(CACHE_KEYS.SETTINGS, settingsData, CACHE_TTL.SETTINGS);

    res.set("X-Cache", "MISS");
    return res.status(200).json(ApiResponse.success({ settings: settingsData }));
});
