import { CookieOptions, Response } from "express";
import authService from "../services/auth.Service";
import ApiResponse from "../utils/response";
import asyncHandler from "../middleware/asyncHandler";
import { AuthRequest } from "../types";
import { emitToAdmin, SocketEvents } from "../config/socket";
import { notifyAdmins } from "./notification.controller";

/* ------------------------------- COOKIES ------------------------------- */

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/* ================================ REGISTER ================================ */

export const register = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const result = await authService.register(req.body);

    // Emit socket event for real-time dashboard update
    emitToAdmin(SocketEvents.USER_REGISTERED, {
      email: req.body.email,
      name: req.body.name,
    });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'user_registered' });

    // Notify Admins
    await notifyAdmins(
      'system_alert',
      'New User Registration',
      `New user ${req.body.name} (${req.body.email}) has registered.`
    );

    res.status(201).json(
      ApiResponse.created(
        result,
        "Registration successful. Please verify your email"
      )
    );
  }
);

/* ============================ VERIFY EMAIL OTP ============================ */

export const verifyEmail = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email, otp } = req.body;

    const { user, accessToken, refreshToken } =
      await authService.verifyEmail(email, otp);

    res.cookie("jwt", accessToken, cookieOptions);

    res.status(200).json(
      ApiResponse.success(
        { user, accessToken, refreshToken },
        "Email verified & logged in"
      )
    );
  }
);

/* ================================= LOGIN ================================= */

export const login = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email, password } = req.body;

    const { user, accessToken, refreshToken } =
      await authService.login(email, password);

    res.cookie("jwt", accessToken, cookieOptions);

    res.status(200).json(
      ApiResponse.success(
        { user, accessToken, refreshToken },
        "Login successful"
      )
    );
  }
);

/* ============================== LOGIN VIA OTP ============================== */

export const sendLoginOTP = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email } = req.body;

    const result = await authService.sendLoginOTP(email);

    res.status(200).json(ApiResponse.success(result));
  }
);

export const loginWithOTP = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email, otp } = req.body;

    const { user, accessToken, refreshToken } =
      await authService.loginWithOTP(email, otp);

    res.cookie("jwt", accessToken, cookieOptions);

    res.status(200).json(
      ApiResponse.success(
        { user, accessToken, refreshToken },
        "Login successful"
      )
    );
  }
);

/* ============================ FORGOT PASSWORD ============================ */

export const forgotPassword = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email } = req.body;

    const result = await authService.forgotPassword(email);

    res.status(200).json(ApiResponse.success(result));
  }
);

/* ============================= RESET PASSWORD ============================= */

export const resetPassword = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { token } = req.params;
    const { password } = req.body;

    const { user, accessToken, refreshToken } =
      await authService.resetPassword(token, password);

    res.cookie("jwt", accessToken, cookieOptions);

    res.status(200).json(
      ApiResponse.success(
        { user, accessToken, refreshToken },
        "Password reset successful"
      )
    );
  }
);

/* =========================== REFRESH TOKEN (ROTATION) =========================== */

export const refreshToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body;

    const tokens = await authService.refreshAccessToken(refreshToken);

    res.status(200).json(
      ApiResponse.success(tokens, "Token refreshed successfully")
    );
  }
);

/* ================================= LOGOUT ================================= */

export const logout = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (req.user) {
      await authService.logout(req.user._id.toString());
    }

    res.clearCookie("jwt", cookieOptions);

    res.status(200).json(
      ApiResponse.success(null, "Logged out successfully")
    );
  }
);

/* ================================= GET ME ================================= */

export const getMe = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(200).json(
      ApiResponse.success(
        { user: req.user },
        "User data retrieved successfully"
      )
    );
  }
);
