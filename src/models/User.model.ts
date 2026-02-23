import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";
import validator from "validator";
import { IUser, IAddress } from "../types/authTypes";
export { IUser };


const addressSchema = new Schema<IAddress>({
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  pinCode: { type: Number, required: true },
  phoneNo: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Please provide your name"],
      trim: true,
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please provide your email"],
      unique: true,
      lowercase: true,
      trim: true,
      set: (v: string) => validator.normalizeEmail(v) || v.toLowerCase(),
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Please provide your phone number"],
      unique: true,
      match: [/^[0-9]{10}$/, "Please provide a valid 10-digit phone number"],
    },
    rewardPoints: { type: Number, default: 0 },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "seller"],
      default: "user",
    },
    addresses: [addressSchema],
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
    refreshToken: String,
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    recentlyViewed: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    coupons: [
      {
        coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
        isUsed: { type: Boolean, default: false },
        assignedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);



userSchema.virtual("isLocked").get(function (this: IUser) {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

userSchema.pre("save", async function (this: IUser, next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(
    this.password,
    parseInt(process.env.BCRYPT_ROUNDS || "12")
  );

  if (this.isModified("password") && !this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }

  next();
});

userSchema.methods.correctPassword = async function (
  this: IUser,
  candidatePassword: string,
  userPassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (
  this: IUser,
  JWTTimestamp: number
): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      (this.passwordChangedAt.getTime() / 1000).toString(),
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.incLoginAttempts = async function (this: IUser) {
  if (this.lockUntil && this.lockUntil < new Date()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates: any = { $inc: { loginAttempts: 1 } };
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
  const lockTime = parseInt(process.env.LOCK_TIME || "3600000");

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + lockTime) };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function (this: IUser) {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

userSchema.methods.createPasswordResetToken = function (this: IUser): string {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

  return resetToken;
};

userSchema.index({ role: 1 });

export default mongoose.model<IUser>("User", userSchema);

