// ============ src/validators/authValidator.ts ============
import { body, ValidationChain } from "express-validator";

export const registerValidator: ValidationChain[] = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone is required")
    .matches(/^[0-9]{10}$/)
    .withMessage("Please provide a valid 10-digit phone number"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase, lowercase, number and special character"
    ),
];

export const loginValidator: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email or Phone is required")
    .custom((value) => {
      if (value.includes("@")) {
        // If it's an email, we should normalize it (manually or via a helper if we want to be safe)
        // actually express-validator doesn't easily allow conditional normalization in one chain
        // but we can just use another chain if needed.
        return true;
      }
      return true;
    }),
  body("password").notEmpty().withMessage("Password is required"),
];

export const verifyEmailValidator: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email"),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
];

export const otpValidator: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email"),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
];

export const forgotPasswordValidator: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email"),
];

export const resetPasswordValidator: ValidationChain[] = [
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase, lowercase, number and special character"
    ),
];
