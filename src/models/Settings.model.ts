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
    emailService: "smtp" | "sendgrid";
    siteBackgroundGradient: string;
    emailEnabled: boolean;
    googleAnalyticsEnabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    sendgridApiKey?: string;
    updatedBy: mongoose.Schema.Types.ObjectId;
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
            enum: ["smtp", "sendgrid"],
            default: "smtp",
        },
        emailEnabled: {
            type: Boolean,
            default: false,
        },
        siteBackgroundGradient: {
            type: String,
            default: "",
        },
        googleAnalyticsEnabled: {
            type: Boolean,
            default: false,
        },
        smtpHost: {
            type: String,
            default: "",
        },
        smtpPort: {
            type: Number,
            default: 587,
        },
        smtpUser: {
            type: String,
            default: "",
        },
        smtpPassword: {
            type: String,
            default: "",
        },
        sendgridApiKey: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<ISettings>("Settings", settingsSchema);
