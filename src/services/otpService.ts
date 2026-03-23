import { Types } from 'mongoose';
import crypto from 'crypto';
import OTP from '../models/OTP.model';
import ApiError from '../utils/apiError';

class OTPService {
  generateOTP(): string {
    const length = parseInt(process.env.OTP_LENGTH || '6');
    return crypto.randomInt(Math.pow(10, length - 1), Math.pow(10, length)).toString();
  }

  async createOTP(
    email: string,
    type: string,
    phone: string | null = null,
    registrationData: any = null
  ): Promise<{ otp: string; otpId: string }> {
    const otp = this.generateOTP();
    const expireMinutes = parseInt(process.env.OTP_EXPIRE_MINUTES || "10");

    await OTP.deleteMany({ email, type, verified: false });

    const otpDoc = await OTP.create({
      email,
      phone,
      otp,
      type,
      registrationData,
      expiresAt: new Date(Date.now() + expireMinutes * 60 * 1000),
    });

    return { otp, otpId: (otpDoc._id as Types.ObjectId).toString() };
  }

  async verifyOTP(email: string, otp: string, type: string) {
    const otpDoc = await OTP.findOne({
      email,
      type,
      verified: false,
      expiresAt: { $gt: new Date() },
    })
      .select("+otp")
      .sort({ createdAt: -1 });

    if (!otpDoc) {
      throw ApiError.badRequest("OTP has expired or is invalid");
    }

    if (otpDoc.attempts >= 3) {
      throw ApiError.tooManyRequests(
        "Too many failed attempts. Please request a new OTP"
      );
    }

    const isValid = await otpDoc.compareOTP(otp);

    if (!isValid) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw ApiError.badRequest(
        `Invalid OTP. ${3 - otpDoc.attempts} attempts remaining`
      );
    }

    otpDoc.verified = true;
    await otpDoc.save();

    return otpDoc;
  }

  async cleanupExpiredOTPs(): Promise<void> {
    await OTP.deleteMany({ expiresAt: { $lt: new Date() } });
  }
}

export default new OTPService();