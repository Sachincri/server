import { Response } from "express";
import User from "../models/User.model";
import ApiResponse from "../utils/response";
import ApiError from "../utils/apiError";
import asyncHandler from "../middleware/asyncHandler";
import { AuthRequest } from "../types";
import CoinLedger from "../models/CoinLedger.model";
import Product from "../models/Product.model";



export const getMyCoinHistory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const history = await CoinLedger.find({ user: req.user!._id })
      .sort({ createdAt: -1 })
      .lean();


    res.status(200).json(ApiResponse.success({ history }));
  }
);



export const getMyReviews = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Find all products that have reviews by this user
    const products: any[] = await Product.find({
      "reviews.user": req.user!._id,
    }).select("name images reviews slug");

    const userReviews: any[] = [];

    products.forEach((product) => {
      if (!product.reviews) return;
      const reviews = product.reviews.filter(
        (rev: any) => rev.user.toString() === req.user!._id.toString()
      );

      reviews.forEach((review: any) => {
        userReviews.push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          productId: product._id,
          productName: product.name,
          productSlug: product.slug,
          productImage: product.images[0]?.url || "",
          createdAt: review.createdAt || new Date(),
        });
      });
    });

    // Sort by most recent
    userReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.status(200).json(ApiResponse.success({ reviews: userReviews }));
  }
);

export const updateProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { name, phone } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(req.user!._id, updateData, {
      new: true,
      runValidators: true,
    });

    res
      .status(200)
      .json(ApiResponse.success({ user }, "Profile updated successfully"));
  }
);

export const updatePassword = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user!._id).select("+password");

    if (
      !user ||
      !(await user.correctPassword(currentPassword, user.password))
    ) {
      throw ApiError.unauthorized("Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    res
      .status(200)
      .json(ApiResponse.success(null, "Password updated successfully"));
  }
);

export const deleteAccount = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    await User.findByIdAndUpdate(req.user!._id, { active: false });

    res.status(204).json(ApiResponse.noContent("Account deleted successfully"));
  }
);
