import mongoose, { Schema, Document } from "mongoose";

export interface ISettings extends Document {
    codMinimumAmount: number;
    codEnabled: boolean;
    deliveryCharges: number;
    freeDeliveryThreshold: number;
    termsAndConditions: string;
    coinEarnRate: number; // e.g., 0.1 for 10%
    coinValue: number; // e.g., 1 for ₹1
    helpLineNumber: string;
    supportEmail: string;
    orderEmailEnabled: boolean;
    maxCoinUsagePercentage: number; // e.g., 20 for 20%
    coinExpiryDays: number; // e.g., 365 for 1 year
    stripeEnabled: boolean;
    aiChatEnabled: boolean;
    aiSuggestionsEnabled: boolean;
    emailService: "brevo";
    siteBackgroundGradient: string;
    emailEnabled: boolean;
    googleAnalyticsEnabled: boolean;
    brevoApiKey?: string;
    updatedBy: mongoose.Schema.Types.ObjectId;
    taxRate: number;

    // AI Caller Settings & Policies
    cancellationPolicy: string;
    refundPolicy: string;
    aiCallCodVerificationEnabled: boolean;
    aiCallReviewCollectionEnabled: boolean;
    aiCallAbandonedCartEnabled: boolean;
    aiCallSupportEnabled: boolean;
    aiReviewCondition: string;
    aiReviewRewardType: "Percentage" | "Fixed";
    aiReviewRewardValue: number;

    // WhatsApp Support Settings
    whatsappSupportEnabled: boolean;
    whatsappToken: string;
    whatsappPhoneNumberId: string;
    whatsappVerifyToken: string;
    whatsappAppSecret: string;

    // Tax & GST Settings
    taxEnabled: boolean;
    gstRate: number;
    gatewayFeeRate: number;

    // Shipping Integration Settings
    shippingProvider: "manual" | "shiprocket" | "delhivery";
    shiprocketEnabled: boolean;
    shiprocketEmail: string;
    shiprocketPassword: string;
    shiprocketChannelId: string;
    delhiveryEnabled: boolean;
    delhiveryApiToken: string;
    delhiveryWarehouseName: string;
    
    // Default Delivery Package Dimensions
    defaultBoxLength: number;
    defaultBoxBreadth: number;
    defaultBoxHeight: number;
    defaultBoxWeight: number;
}

const settingsSchema = new Schema<ISettings>(
    {
        codMinimumAmount: {
            type: Number,
            default: 0,
        },
        codEnabled: {
            type: Boolean,
            default: true,
        },
        deliveryCharges: {
            type: Number,
            default: 40,
        },
        freeDeliveryThreshold: {
            type: Number,
            default: 500,
        },
        coinEarnRate: {
            type: Number,
            default: 0.1, // 10%
        },
        coinValue: {
            type: Number,
            default: 1, // 1 Coin = 1 ₹
        },
        termsAndConditions: {
            type: String,
            default: "Amount charged is non-refundable for COD orders.",
        },
        helpLineNumber: {
            type: String,
            default: "",
        },
        supportEmail: {
            type: String,
            default: "",
        },
        orderEmailEnabled: {
            type: Boolean,
            default: false,
        },
        maxCoinUsagePercentage: {
            type: Number,
            default: 20, // 20%
        },
        coinExpiryDays: {
            type: Number,
            default: 365, // 1 year
        },
        stripeEnabled: {
            type: Boolean,
            default: false,
        },
        aiChatEnabled: {
            type: Boolean,
            default: true,
        },
        aiSuggestionsEnabled: {
            type: Boolean,
            default: true,
        },
        emailService: {
            type: String,
            enum: ["brevo"],
            default: "brevo",
        },
        emailEnabled: {
            type: Boolean,
            default: true,
        },
        siteBackgroundGradient: {
            type: String,
            default: "",
        },
        googleAnalyticsEnabled: {
            type: Boolean,
            default: false,
        },
        brevoApiKey: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        cancellationPolicy: {
            type: String,
            default: "Orders can only be cancelled while in Processing status.",
        },
        refundPolicy: {
            type: String,
            default: "Refunds are applicable within 7 days of delivery for damaged products.",
        },
        aiCallCodVerificationEnabled: {
            type: Boolean,
            default: false,
        },
        aiCallReviewCollectionEnabled: {
            type: Boolean,
            default: false,
        },
        aiCallAbandonedCartEnabled: {
            type: Boolean,
            default: false,
        },
        aiCallSupportEnabled: {
            type: Boolean,
            default: false,
        },
        aiReviewCondition: {
            type: String,
            default: "Provide a Video Review",
        },
        aiReviewRewardType: {
            type: String,
            enum: ["Percentage", "Fixed"],
            default: "Percentage",
        },
        aiReviewRewardValue: {
            type: Number,
            default: 50,
        },
        whatsappSupportEnabled: {
            type: Boolean,
            default: false,
        },
        whatsappToken: {
            type: String,
            default: "", // Temporary or Permanent Meta Graph API Token
        },
        whatsappPhoneNumberId: {
            type: String,
            default: "", // Meta Phone Number ID
        },
        whatsappVerifyToken: {
            type: String,
            default: "", // Custom token defined by admin for Webhook Verification
        },
        whatsappAppSecret: {
            type: String,
            default: "", // Meta App Secret for HMAC validation
        },
        taxEnabled: {
            type: Boolean,
            default: false,
        },
        taxRate: {
            type: Number,
            default: 0, // Additional tax %
        },
        gstRate: {
            type: Number,
            default: 18, // 18% GST
        },
        gatewayFeeRate: {
            type: Number,
            default: 2, // 2% Payment Gateway Fee
        },
        // Shipping Integration
        shippingProvider: {
            type: String,
            enum: ["manual", "shiprocket", "delhivery"],
            default: "manual",
        },
        shiprocketEnabled: {
            type: Boolean,
            default: false,
        },
        shiprocketEmail: {
            type: String,
            default: "",
        },
        shiprocketPassword: {
            type: String,
            default: "",
        },
        shiprocketChannelId: {
            type: String,
            default: "",
        },
        delhiveryEnabled: {
            type: Boolean,
            default: false,
        },
        delhiveryApiToken: {
            type: String,
            default: "",
        },
        delhiveryWarehouseName: {
            type: String,
            default: "",
        },
        defaultBoxLength: {
            type: Number,
            default: 20, // 20 cm
        },
        defaultBoxBreadth: {
            type: Number,
            default: 15, // 15 cm
        },
        defaultBoxHeight: {
            type: Number,
            default: 10, // 10 cm
        },
        defaultBoxWeight: {
            type: Number,
            default: 0.5, // 0.5 kg
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<ISettings>("Settings", settingsSchema);
