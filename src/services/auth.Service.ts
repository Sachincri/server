import jwt from "jsonwebtoken";
import crypto from "crypto";
import validator from "validator";
import User, { IUser } from "../models/User.model";
import otpService from "./otpService";
import emailService from "./email.Service";
import ApiError from "../utils/apiError";
import { RegisterDTO } from "../types";

/* ---------------------------------- TYPES --------------------------------- */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/* --------------------------------- SERVICE -------------------------------- */

class AuthService {
  /* ============================== JWT HELPERS ============================== */

  private signAccessToken(userId: string): string {
    return jwt.sign(
      { id: userId },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRE } as any
    );
  }

  private signRefreshToken(userId: string): string {
    return jwt.sign(
      { id: userId },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE } as any
    );
  }

  /* ============================ TOKEN GENERATION ============================ */

  async generateTokens(user: IUser): Promise<TokenPair> {
    const accessToken = this.signAccessToken(String(user._id));
    const refreshToken = this.signRefreshToken(String(user._id));

    user.refreshToken = refreshToken;
    user.refreshTokenExpires = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  }

  /* ================================ REGISTER ================================ */

  async register(userData: RegisterDTO): Promise<{ message: string }> {
    const { email: rawEmail, phone } = userData;
    const email = validator.normalizeEmail(rawEmail) || rawEmail.toLowerCase();

    // Check if user already exists and is verified
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        if (existingUser.email === email) {
          throw ApiError.conflict("Email already registered and verified");
        }
        throw ApiError.conflict("Phone number already registered and verified");
      }
      // If user exists but is not verified (from old flow), we can still proceed
      // but maybe we should delete or update them? 
      // For now, let's treat it as a new registration request and we'll handle the collision during actual creation.
    }

    // Instead of creating the user now, we store the data in the OTP document
    const { otp } = await otpService.createOTP(
      email,
      "email_verification",
      phone,
      userData // Store the registration data
    );

    await emailService.sendOTP(email, otp);

    return { message: "OTP sent to your email" };
  }

  /* ============================ VERIFY EMAIL OTP ============================ */

  async verifyEmail(email: string, otp: string) {
    // verifyOTP now returns the otpDoc containing registrationData
    const otpDoc = await otpService.verifyOTP(email, otp, "email_verification");

    if (!otpDoc.registrationData) {
      throw ApiError.badRequest("Registration data not found. Please register again.");
    }

    // Now finally create the user in the database
    const user = await User.create({
      ...otpDoc.registrationData,
      isEmailVerified: true,
    });

    if (!user) throw ApiError.internal("Failed to create user account");

    const tokens = await this.generateTokens(user);

    await emailService.sendWelcomeEmail(email, user.name);

    user.password = undefined as any;
    user.refreshToken = undefined;

    return { user, ...tokens };
  }

  /* ================================= LOGIN ================================= */

  async login(emailOrPhone: string, password: string) {
    const isEmail = emailOrPhone.includes('@');
    const normalizedEmailOrPhone = isEmail ? (validator.normalizeEmail(emailOrPhone) || emailOrPhone.toLowerCase()) : emailOrPhone;
    const query = isEmail ? { email: normalizedEmailOrPhone } : { phone: normalizedEmailOrPhone };

    const user = await User.findOne(query).select(
      "+password +active +loginAttempts +lockUntil"
    );

    if (!user || !user.active) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    if (user.isLocked) {
      throw ApiError.tooManyRequests("Account temporarily locked");
    }

    if (!user.isEmailVerified) {
      throw ApiError.forbidden("Please verify your email first");
    }

    const isPasswordCorrect = await user.correctPassword(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      await user.incLoginAttempts();
      throw ApiError.unauthorized("Invalid credentials");
    }

    await user.resetLoginAttempts();

    const tokens = await this.generateTokens(user);

    user.password = undefined as any;
    user.refreshToken = undefined;

    return { user, ...tokens };
  }

  /* ============================== LOGIN VIA OTP ============================== */

  async sendLoginOTP(email: string) {
    const normalizedEmail = validator.normalizeEmail(email) || email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) throw ApiError.notFound("User not found");
    if (!user.isEmailVerified) {
      throw ApiError.forbidden("Please verify your email first");
    }

    const { otp } = await otpService.createOTP(normalizedEmail, "login");
    await emailService.sendOTP(normalizedEmail, otp);

    return { message: "OTP sent to your email" };
  }

  async loginWithOTP(email: string, otp: string) {
    const normalizedEmail = validator.normalizeEmail(email) || email.toLowerCase();
    await otpService.verifyOTP(normalizedEmail, otp, "login");

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw ApiError.notFound("User not found");

    const tokens = await this.generateTokens(user);

    user.password = undefined as any;
    user.refreshToken = undefined;

    return { user, ...tokens };
  }

  /* ============================ FORGOT PASSWORD ============================ */

  async forgotPassword(email: string) {
    const normalizedEmail = validator.normalizeEmail(email) || email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw ApiError.notFound("No user found with that email");

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    await emailService.sendPasswordReset(normalizedEmail, resetURL);

    return { message: "Password reset link sent to email" };
  }

  /* ============================= RESET PASSWORD ============================= */

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw ApiError.badRequest("Token is invalid or expired");
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const tokens = await this.generateTokens(user);

    user.password = undefined as any;
    user.refreshToken = undefined;

    return { user, ...tokens };
  }

  /* ======================= REFRESH TOKEN (ROTATION) ======================= */

  async refreshAccessToken(oldRefreshToken: string) {
    const decoded = jwt.verify(
      oldRefreshToken,
      process.env.JWT_REFRESH_SECRET as string
    ) as { id: string };

    const user = await User.findOne({
      _id: decoded.id,
      refreshToken: oldRefreshToken,
      refreshTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    return this.generateTokens(user);
  }

  /* ================================= LOGOUT ================================= */

  async logout(userId: string): Promise<void> {
    await User.updateOne(
      { _id: userId },
      { $unset: { refreshToken: 1, refreshTokenExpires: 1 } }
    );
  }
}

export default new AuthService();
