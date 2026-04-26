import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { promisify } from "util";
import User from "../models/User.model";
import asyncHandler from "./asyncHandler";
import { AuthRequest, TokenPayload } from "../types";
import ApiError from "../utils/apiError";

const verifyToken = promisify<string, string, TokenPayload>(jwt.verify as any);

export const protect = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      throw ApiError.unauthorized(
        "You are not logged in. Please log in to get access"
      );
    }

    const decoded = await verifyToken(token, process.env.JWT_SECRET as string);

    const user = await User.findById(decoded.id).select("+active");
    if (!user || !user.active) {
      throw ApiError.unauthorized(
        "The user belonging to this token no longer exists"
      );
    }

    if (user.changedPasswordAfter(decoded.iat!)) {
      throw ApiError.unauthorized(
        "User recently changed password. Please log in again"
      );
    }

    req.user = user;
    next();
  }
);

export const optionalProtect = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return next();
    }

    try {
      const decoded = await verifyToken(token, process.env.JWT_SECRET as string);
      const user = await User.findById(decoded.id).select("+active");

      if (user && user.active && !user.changedPasswordAfter(decoded.iat!)) {
        req.user = user;
      }
    } catch (err) {
      // Ignore errors for optional protection
    }

    next();
  }
);

export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw ApiError.forbidden(
        "You do not have permission to perform this action"
      );
    }
    next();
  };
};

export const verifyBlandWebhook = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const secret = process.env.BLAND_WEBHOOK_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw ApiError.unauthorized("Webhook secret not configured server-side");
        }
        return next();
    }

    const providedSecret = req.headers["x-bland-secret"];
    if (providedSecret !== secret) {
        throw ApiError.unauthorized("Invalid webhook signature from Bland AI");
    }

    next();
  }
);
