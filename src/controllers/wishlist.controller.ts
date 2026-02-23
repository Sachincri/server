import { Response, NextFunction } from "express";
import Wishlist from "../models/Wishlist.model";
import Product from "../models/Product.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { AuthRequest } from "../types/index";

/**
 * Get user wishlist
 * GET /api/wishlist
 */
export const getWishlist = asyncHandler(
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?._id;

        let wishlist = await Wishlist.findOne({ user: userId }).populate(
            "products",
            "name price images stock" // Select necessary fields
        );

        if (!wishlist) {
            wishlist = await Wishlist.create({ user: userId, products: [] });
        }

        res.status(200).json(ApiResponse.success({ wishlist }));
    }
);

/**
 * Add product to wishlist
 * POST /api/wishlist
 */
export const addToWishlist = asyncHandler(
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?._id;
        const { productId } = req.body;

        if (!productId) {
            throw ApiError.badRequest("Product ID is required");
        }

        const product = await Product.findById(productId);
        if (!product) {
            throw ApiError.notFound("Product not found");
        }

        let wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            wishlist = await Wishlist.create({ user: userId, products: [productId] });
        } else {
            if (!wishlist.products.includes(productId)) {
                wishlist.products.push(productId);
                await wishlist.save();
            }
        }

        res
            .status(200)
            .json(ApiResponse.success({ wishlist }, "Added to wishlist"));
    }
);

/**
 * Remove product from wishlist
 * DELETE /api/wishlist/:productId
 */
export const removeFromWishlist = asyncHandler(
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?._id;
        const { productId } = req.params;

        const wishlist = await Wishlist.findOne({ user: userId });

        if (wishlist) {
            wishlist.products = wishlist.products.filter(
                (id) => id.toString() !== productId
            );
            await wishlist.save();
        }

        res
            .status(200)
            .json(ApiResponse.success({ wishlist }, "Removed from wishlist"));
    }
);
