import express from "express";
import {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  otpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} from "../validators/authValidator";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.middleware";
import
  * as authController
  from "../controllers/auth.controller";

const router = express.Router();

// Public routes
router.post("/register", authLimiter, registerValidator, validate, authController.register);
router.post(
  "/verify-email",
  authLimiter,
  verifyEmailValidator,
  validate,
  authController.verifyEmail
);
router.post("/login", authLimiter, loginValidator, validate, authController.login);
router.post(
  "/send-login-otp",
  otpLimiter,
  // loginValidator,
  // validate,
  authController.sendLoginOTP
);
router.post("/login-otp", authLimiter, otpValidator, validate, authController.loginWithOTP);
router.post(
  "/forgot-password",
  otpLimiter,
  forgotPasswordValidator,
  validate,
  authController.forgotPassword
);
router.patch(
  "/reset-password/:token",
  authLimiter,
  resetPasswordValidator,
  validate,
  authController.resetPassword
);

// Protected routes
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);

export default router;
