import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IOTP extends Document {
  email: string;
  phone?: string;
  otp: string; // stored as a hash
  type:
    | "email_verification"
    | "phone_verification"
    | "login"
    | "password_reset";
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  compareOTP(candidateOTP: string): Promise<boolean>;
}

const otpSchema = new Schema<IOTP>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "email_verification",
        "phone_verification",
        "login",
        "password_reset",
      ],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // expire at expiresAt
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Hash OTP before saving
otpSchema.pre<IOTP>("save", async function (next) {
  if (!this.isModified("otp")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.otp = await bcrypt.hash(this.otp, salt);
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Instance method to compare OTP
otpSchema.methods.compareOTP = async function (
  candidateOTP: string
): Promise<boolean> {
  return bcrypt.compare(candidateOTP, this.otp);
};

export default mongoose.model<IOTP>("OTP", otpSchema);
