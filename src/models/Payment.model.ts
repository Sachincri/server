// file: models/paymentModel.ts
import mongoose, { Document, Schema } from "mongoose";

/**
 * Payment document interface
 */
export interface IPayment extends Document {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;

  stripe_payment_intent_id?: string;
  provider: "razorpay" | "stripe";

  amount: number;
  currency: string;

  method?: string;
  status: "success" | "failed" | "pending" | "refunded";

  email?: string;
  contact?: string;

  capturedAt?: Date;

  refunded?: boolean;
  refundId?: string;
  refundAmount?: number;
  refundedAt?: Date;

  failureReason?: string;
}

/**
 * Payment schema
 */
const paymentSchema = new Schema<IPayment>(
  {
    razorpay_order_id: {
      type: String,
      index: true,
    },

    razorpay_payment_id: {
      type: String,
      unique: true,
      sparse: true, // Allow multiple nulls/missing values
      index: true,
    },

    razorpay_signature: {
      type: String,
    },

    stripe_payment_intent_id: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      default: "razorpay",
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      default: "INR",
    },

    method: String,

    status: {
      type: String,
      enum: ["success", "failed", "pending", "refunded"],
      default: "pending",
    },

    email: String,
    contact: String,

    capturedAt: Date,

    refunded: {
      type: Boolean,
      default: false,
    },

    refundId: String,

    refundAmount: {
      type: Number,
      min: 0,
    },

    refundedAt: Date,

    failureReason: String,
  },
  {
    timestamps: true,
  }
);

/**
 * Indexes for performance
 */
paymentSchema.index({ status: 1 });
paymentSchema.index({ refunded: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
