import mongoose, { Document } from "mongoose";

export interface IAddress {
  _id: mongoose.Types.ObjectId;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: number;
  phoneNo: string;
  isDefault: boolean;
  name: string;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  password: string;
  rewardPoints: number;
  role: "user" | "admin" | "seller";
  addresses: IAddress[];
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  active: boolean;
  loginAttempts: number;
  lockUntil?: Date;
  refreshToken?: string;
  refreshTokenExpires?: Date;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  isLocked: boolean;
  coupons: {
    coupon: mongoose.Types.ObjectId;
    isUsed: boolean;
    assignedAt: Date;
  }[];
  correctPassword(
    candidatePassword: string,
    userPassword: string
  ): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  incLoginAttempts(): Promise<any>;
  resetLoginAttempts(): Promise<any>;
  createPasswordResetToken(): string;
  recentlyViewed: mongoose.Types.ObjectId[];
}

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
  registrationData?: any;
  compareOTP(candidateOTP: string): Promise<boolean>;
}