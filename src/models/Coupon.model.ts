import mongoose, { Document, Schema } from 'mongoose';

export interface ICoupon extends Document {
    code: string;
    description?: string;
    discountType: 'percentage' | 'fixed';
    discountAmount: number;
    minPurchaseAmount: number;
    maxDiscountAmount?: number; // For percentage based discounts
    startDate: Date;
    expiryDate: Date;
    usageLimit: number; // Total number of times this coupon can be used globally
    usedCount: number;
    isActive: boolean;
    assignedUsers: mongoose.Types.ObjectId[]; // Users who have been explicitly assigned this coupon
}

const CouponSchema: Schema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
        },
        discountType: {
            type: String,
            enum: ['percentage', 'fixed'],
            required: true,
        },
        discountAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        minPurchaseAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxDiscountAmount: {
            type: Number,
            min: 0
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        expiryDate: {
            type: Date,
            required: true,
        },
        usageLimit: {
            type: Number,
            default: null, // null means unlimited
        },
        usedCount: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        assignedUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    {
        timestamps: true,
    }
);

// Index for faster queries on code and validity
CouponSchema.index({ code: 1, isActive: 1, expiryDate: 1 });

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
