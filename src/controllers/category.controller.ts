import { Request, Response } from "express";
import { Category } from "../models/Category.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiResponse from "../utils/response";
import ApiError from "../utils/apiError";
import { toSlug } from "../utils/helper";
import { uploadOnCloudinary } from "../utils/uploadOnCloudinary";

export const getAllCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const categories = await Category.find().populate('parent', 'name slug').lean();
    return res.status(200).json(ApiResponse.success(categories));
  }
);

// Alias for home.routes.ts compatibility
export const getCategories = getAllCategories;

export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, parent } = req.body;

    if (!name) throw ApiError.badRequest("Category name is required");

    const file = req.file;
    if (!file) throw ApiError.badRequest("Category image is required");

    // If parent is provided, validate it exists and calculate level
    let level = 0;
    let parentCategory = null;

    if (parent) {
      parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        throw ApiError.badRequest("Parent category not found");
      }
      level = (parentCategory.level || 0) + 1;
    }

    // Upload to Cloudinary
    const result = await uploadOnCloudinary(file.path, { folder: "categories" });
    if (!result) throw ApiError.internal("Failed to upload image");

    const category = await Category.create({
      name,
      slug: toSlug(name),
      image: {
        public_id: result.public_id,
        url: result.secure_url
      },
      parent: parent || null,
      level
    });

    return res.status(201).json(ApiResponse.created(category, "Category created successfully"));
  }
);
