import { Request, Response } from "express";
import { Brand } from "../models/Brand.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiResponse from "../utils/response";
import ApiError from "../utils/apiError";
import { toSlug } from "../utils/helper";
import { uploadOnCloudinary } from "../utils/uploadOnCloudinary";

export const getAllBrands = asyncHandler(
  async (_req: Request, res: Response) => {
    const brands = await Brand.find().lean();
    return res.status(200).json(ApiResponse.success(brands));
  }
);

// Alias for home.routes.ts compatibility
export const getBrands = getAllBrands;

export const createBrand = asyncHandler(
  async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name) throw ApiError.badRequest("Brand name is required");

    const file = req.file;
    if (!file) throw ApiError.badRequest("Brand logo is required");

    // Upload to Cloudinary
    const result = await uploadOnCloudinary(file.path, { folder: "brands" });
    if (!result) throw ApiError.internal("Failed to upload image");

    const brand = await Brand.create({
      name,
      slug: toSlug(name),
      logo: {
        public_id: result.public_id,
        url: result.secure_url
      }
    });

    return res.status(201).json(ApiResponse.created(brand, "Brand created successfully"));
  }
);
