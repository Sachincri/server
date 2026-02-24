import { Request, Response, NextFunction } from "express";
import Product from "../models/Product.model";
import Order from "../models/Order.model";
import User from "../models/User.model";
import asyncHandler from "../middleware/asyncHandler";
import SearchFeatures from "../utils/search";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/uploadOnCloudinary";
import ApiError from "../utils/apiError";
import { Category } from "../models/Category.model";
import { Brand } from "../models/Brand.model";
import { toSlug, toStringArray } from "../utils/helper";
import { ImageLink, Review } from "../types/productTypes";
import ApiResponse from "../utils/response";
import { emitToAdmin, SocketEvents } from "../config/socket";
import { AuthRequest } from "../types/index";

// Helper to parse multipart array fields (which might be JSON strings)
const parseJSONField = (field: string | string[] | undefined): any[] => {
  if (!field) return [];
  const arr = Array.isArray(field) ? field : [field];
  return arr.map((item) => {
    try {
      return JSON.parse(item);
    } catch (e) {
      return item;
    }
  });
};

interface ProductData {
  name: string;
  categoryId: string;
  subCategoryId?: string;
  brandId?: string;
  maximumRetailPrice?: number;
  sellingPrice: number;
  actualPrice?: number;
  discount?: number;
  offers?: string[] | string;
  highlights?: string[] | string;
  colors?: string[] | string; // JSON strings
  sizes?: string[] | string;
  specifications?: string[] | string; // JSON strings
  stock: number;
  warranty?: string;
  description?: string;
  isActive: boolean;
  seo?: string | {
    title?: string;
    description?: string;
    keywords?: string[];
  };
}

// Constants
const RESULT_PER_PAGE = 12;
const MAX_IMAGES = 10;
const MIN_RATING = 1;
const MAX_RATING = 5;
const MAX_COMMENT_LENGTH = 100;
const MIN_PRODUCT_NAME_LENGTH = 3;
const LOW_STOCK_THRESHOLD = 10;
const MAX_RESULTS_PER_PAGE = 100;

// Helper Functions
const validateProductData = (data: Partial<ProductData>): string[] => {
  const errors: string[] = [];

  if (data.name && data.name.trim().length < MIN_PRODUCT_NAME_LENGTH) {
    errors.push(
      `Product name must be at least ${MIN_PRODUCT_NAME_LENGTH} characters`
    );
  }

  if (data.sellingPrice !== undefined && Number(data.sellingPrice) <= 0) {
    errors.push("Selling price must be greater than 0");
  }

  if (
    data.maximumRetailPrice !== undefined &&
    data.sellingPrice !== undefined &&
    Number(data.maximumRetailPrice) < Number(data.sellingPrice)
  ) {
    errors.push("Maximum Retail Price (MRP) must be greater than or equal to selling price");
  }

  if (data.actualPrice !== undefined && Number(data.actualPrice) < 0) {
    errors.push("Actual price cannot be negative");
  }

  if (data.stock !== undefined && Number(data.stock) < 0) {
    errors.push("Stock cannot be negative");
  }

  if (
    data.discount !== undefined &&
    (Number(data.discount) < 0 || Number(data.discount) > 100)
  ) {
    errors.push("Discount must be between 0 and 100");
  }

  return errors;
};

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const uploadImages = async (
  files: Express.Multer.File[]
): Promise<ImageLink[]> => {
  if (files.length > MAX_IMAGES) {
    throw ApiError.badRequest(`Maximum ${MAX_IMAGES} images allowed`);
  }

  const uploadPromises = files.map(async (file: { path: string }) => {
    const result = await uploadOnCloudinary(file.path, {
      folder: "products",
    });

    if (!result || !result.public_id || !result.secure_url) {
      throw ApiError.internal("Failed to upload image");
    }

    return {
      public_id: result.public_id,
      url: result.secure_url,
    };
  });

  return await Promise.all(uploadPromises);
};

export const deleteImages = async (images: (ImageLink | string)[]): Promise<void> => {
  const deletePromises = images.map((img) => {
    const publicId = typeof img === "string" ? img : img.public_id;
    return deleteFromCloudinary(publicId).catch((err: Error) => {
      console.error(`Failed to delete image ${publicId}:`, err);
    });
  });

  await Promise.allSettled(deletePromises);
};

const calculateAverageRating = (reviews: Review[]): number => {
  if (reviews.length === 0) return 0;

  const sum = reviews.reduce((acc, rev) => acc + rev.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
};

export const createProduct = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      name,
      categoryId,
      brandId,
      maximumRetailPrice,
      sellingPrice,
      actualPrice,
      discount,
      offers,
      highlights,
      colors, // Array of JSON strings: '{"name": "Red", "imageField": "color_img_123"}'
      sizes,
      specifications, // Array of JSON strings
      stock,
      warranty,
      description,
      seo,
    } = req.body as ProductData;

    // Basic required fields
    if (!name || !categoryId || !sellingPrice || stock === undefined) {
      throw ApiError.badRequest("Please provide all required fields");
    }

    // Custom validation
    const validationErrors = validateProductData(req.body);
    if (validationErrors.length > 0) {
      throw ApiError.badRequest(validationErrors.join(", "));
    }

    // Category & Brand
    const category = await Category.findById(categoryId);
    if (!category) throw ApiError.badRequest("Invalid category");

    let brandDoc = null;
    if (brandId) {
      brandDoc = await Brand.findById(brandId);
      if (!brandDoc) throw ApiError.badRequest("Invalid brand");
    }

    const slug = toSlug(name);

    // Handle Files (upload.any())
    const allFiles = (req.files as Express.Multer.File[]) || [];
    const mainImageFiles = allFiles.filter((f) => f.fieldname === "images");
    const thumbnailFile = allFiles.find((f) => f.fieldname === "thumbnail");

    if (mainImageFiles.length === 0) {
      throw ApiError.badRequest("Please add at least one product image");
    }

    const imagesLinks = await uploadImages(mainImageFiles);

    let thumbnailLink = undefined;
    if (thumbnailFile) {
      const thumbResult = await uploadImages([thumbnailFile]);
      if (thumbResult.length > 0) thumbnailLink = thumbResult[0];
    }

    const offersArr = toStringArray(offers);
    const highlightsArr = toStringArray(highlights);
    const sizesArr = toStringArray(sizes);

    // Parse Specifications
    const specificationsRaw = parseJSONField(specifications);
    // Ensure structure if needed, or trust the parser/validation

    // Process Colors
    const colorsRaw = parseJSONField(colors);
    const processedColors = await Promise.all(
      colorsRaw.map(async (c: any) => {
        // c is object: { name: "Red", imageField: "color_img_xyz" }
        const colorObj = { name: c.name, image: c.image || "" };
        if (c.imageField) {
          const file = allFiles.find((f) => f.fieldname === c.imageField);
          if (file) {
            const uploaded = await uploadImages([file]);
            if (uploaded[0]) colorObj.image = uploaded[0].url;
          }
        }
        return colorObj;
      })
    );

    const newProduct = await Product.create({
      name: name.trim(),
      description: description?.trim() || "",
      maximumRetailPrice: maximumRetailPrice ?? sellingPrice,
      sellingPrice,
      actualPrice,
      discount: discount ?? 0,
      category: category._id,
      brand: brandDoc?._id || undefined,
      stock,
      images: imagesLinks,
      thumbnail: thumbnailLink,
      seller: req.user?._id,
      offers: offersArr,
      highlights: highlightsArr,
      colors: processedColors,
      sizes: sizesArr,
      specifications: specificationsRaw,
      warranty: warranty?.trim() || "",
      slug,
      isActive: req.body.isActive === 'false' ? false : true,
      seo: (() => {
        const seoObj = typeof seo === 'string' ? JSON.parse(seo) : seo;
        if (seoObj) {
          if (seoObj.title) seoObj.title = seoObj.title.substring(0, 60);
          if (seoObj.description) seoObj.description = seoObj.description.substring(0, 160);
        }
        return seoObj;
      })(),
    });

    // Emit socket event
    emitToAdmin(SocketEvents.PRODUCT_CREATED, {
      productId: newProduct._id,
      name: newProduct.name,
      sellingPrice: newProduct.sellingPrice,
      stock: newProduct.stock,
    });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: "product_created" });

    res
      .status(201)
      .json(ApiResponse.created(null, "Product created successfully"));
  }
);


export const getAllProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const resultPerPage = Number(req.query.limit) || RESULT_PER_PAGE;
    const currentPage = Number(req.query.page) || 1;

    if (resultPerPage < 1 || resultPerPage > MAX_RESULTS_PER_PAGE) {
      throw ApiError.badRequest(
        `Results per page must be between 1 and ${MAX_RESULTS_PER_PAGE}`
      );
    }

    // ---------- Base Query ----------
    const baseQuery = new SearchFeatures(Product.find(), req.query)
      .search()
      .filter();

    // ---------- Counts (NO DOCUMENT FETCH) ----------
    const [productsCount, filteredProductsCount] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments(baseQuery.query.getFilter()),
    ]);

    // ---------- Pagination ----------
    baseQuery.pagination(resultPerPage);

    const products = await baseQuery.query
      .lean() // 🔥 BIG performance boost
      .exec();

    // ---------- Response ----------
    res.status(200).json(
      ApiResponse.success({
        products,
        productsCount,
        filteredProductsCount,
        resultPerPage,
        currentPage,
        totalPages: Math.ceil(filteredProductsCount / resultPerPage),
      })
    );
  }
);

export const getAdminProducts = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Fetch products with limited fields to improve performance
    const products = await Product.find({})
      .select("-reviews")
      .sort({ createdAt: -1 })
      .lean();

    if (!products) {
      throw ApiError.internal("Failed to fetch products");
    }

    // 2. Safely populate to avoid CastError on corrupted data (e.g., string category names instead of ObjectIds)
    // We sanitize the data first because populate throws CastError if it encounters a non-ObjectId string
    const sanitizedProducts = products.map((product: any) => {
      // Check and sanitize category
      if (product.category && !isValidObjectId(product.category.toString())) {
        product.category = null;
      }
      // Check and sanitize brand
      if (product.brand && !isValidObjectId(product.brand.toString())) {
        product.brand = null;
      }
      return product;
    });

    try {
      await Product.populate(sanitizedProducts, [
        { path: "category", select: "name" },
        { path: "brand", select: "name" },
      ]);
    } catch (populationError) {
      console.error("Warning: Population failed for some products:", populationError);
    }

    // 3. Calculate statistics safely
    const productsCount = products.length;
    const outOfStockCount = products.filter((p: any) => p.stock === 0).length;
    const lowStockCount = products.filter(
      (p: any) => p.stock > 0 && p.stock <= (LOW_STOCK_THRESHOLD || 10)
    ).length;

    res.status(200).json(
      ApiResponse.success({
        products,
        statistics: {
          total: productsCount,
          outOfStock: outOfStockCount,
          inStock: productsCount - outOfStockCount,
          lowStock: lowStockCount,
        },
      })
    );
  }
);

export const getProductDetails = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!id) {
      throw ApiError.badRequest("Product identifier is required");
    }

    let product;
    if (isValidObjectId(id)) {
      product = await Product.findById(id).populate("category").populate("brand");
    } else {
      product = await Product.findOne({ slug: id }).populate("category").populate("brand");
    }

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    res.status(200).json(ApiResponse.success({ product }));
  }
);

export const updateProduct = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid product ID");
    }

    const productData = req.body as ProductData;

    // Validation
    const validationErrors = validateProductData(productData);
    if (validationErrors.length > 0) {
      throw ApiError.badRequest(validationErrors.join(", "));
    }

    let product = await Product.findById(id);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const update: any = {};

    // Validate & update category
    if (productData.categoryId) {
      const category = await Category.findById(productData.categoryId);
      if (!category) throw ApiError.badRequest("Invalid category");
      update.category = category._id;
    }

    // Validate & update brand
    if (productData.brandId) {
      const brand = await Brand.findById(productData.brandId);
      if (!brand) throw ApiError.badRequest("Invalid brand");
      update.brand = brand._id;
    }

    // Update basic fields
    if (productData.name) update.name = productData.name.trim();
    if (productData.description !== undefined)
      update.description = productData.description.trim();
    if (productData.sellingPrice !== undefined) update.sellingPrice = productData.sellingPrice;
    if (productData.maximumRetailPrice !== undefined)
      update.maximumRetailPrice = productData.maximumRetailPrice;
    if (productData.actualPrice !== undefined) update.actualPrice = productData.actualPrice;
    if (productData.discount !== undefined)
      update.discount = productData.discount;
    if (productData.stock !== undefined) update.stock = productData.stock;
    if (productData.warranty !== undefined)
      update.warranty = productData.warranty.trim();
    if ((productData as any).isActive !== undefined) {
      update.isActive =
        (productData as any).isActive === "true" ||
        (productData as any).isActive === true;
    }

    // Normalize multi-fields
    if (productData.offers !== undefined)
      update.offers = toStringArray(productData.offers);
    if (productData.highlights !== undefined)
      update.highlights = toStringArray(productData.highlights);
    if (productData.sizes !== undefined)
      update.sizes = toStringArray(productData.sizes);

    if (productData.specifications !== undefined)
      update.specifications = parseJSONField(productData.specifications);

    if (productData.seo !== undefined) {
      const seo = typeof productData.seo === 'string' ? JSON.parse(productData.seo) : productData.seo;
      if (seo) {
        if (seo.title) seo.title = seo.title.substring(0, 60);
        if (seo.description) seo.description = seo.description.substring(0, 160);
      }
      update.seo = seo;
    }

    // Handle Files
    const allFiles = (req.files as Express.Multer.File[]) || [];
    const mainImageFiles = allFiles.filter((f) => f.fieldname === "images");
    const thumbnailFile = allFiles.find((f) => f.fieldname === "thumbnail");

    // Update Main Images if new ones provided
    if (mainImageFiles.length > 0) {
      // logic to replace or append? Usually replace if new set provided, or appends.
      // Current logic: replace ONLY if files uploaded.
      // However, typical 'edit' flows might preserve old ones unless explicitly removed.
      // The 'add-product-modal' sends 'removedImageUrls'.
      // But existing backend logic for createProduct update was:
      // "replace ONLY if files uploaded" -> and it deleted old images.
      // We should stick to the existing behavior or improve it.
      // The frontend sends `removedImageUrls` but the backend didn't seem to use it in updateProduct previously?
      // Wait, I don't see `removedImageUrls` usage in the original code.
      // Original:
      // const oldImages = [...product.images];
      // const imagesLinks = await uploadImages(files);
      // update.images = imagesLinks;
      // await deleteImages(oldImages);
      // So it was a full replace.
      // If I want to support partial updates (keep existing, add new), I need to change frontend to send *all* needed images?
      // The frontend `add-product-modal` handles `existingImages`.
      // If I upload new files, they are separate.
      // If I want to MIX existing and new, I should:
      // 1. Keep `product.images` that are NOT in `removedImageUrls` (if supported).
      // 2. Add new `mainImageFiles`.
      // But let's stick to the previous aggressive replace if that's what it did, OR check if I can interpret "images" as *additions*?
      // Actually, the previous code ignored `removedImageUrls` from body (it wasn't in interface) and just replaced everything if `files.length > 0`.
      // This implies if you add one photo, you lose all others? That's a bad UX.
      // But I will stick to what was there unless I see `removedImageUrls` in usages.
      // The frontend DOES send `removedImageUrls` (line 241).
      // So I should implement that logic!
      const removedUrls = toStringArray(req.body.removedImageUrls);
      let currentImages = product.images;

      if (removedUrls.length > 0) {
        await deleteImages(removedUrls);
        currentImages = currentImages.filter(img => !removedUrls.includes(img.url));
      }

      if (mainImageFiles.length > 0) {
        const newLinks = await uploadImages(mainImageFiles);
        currentImages = [...currentImages, ...newLinks];
      }

      // Only update if we made changes
      if (removedUrls.length > 0 || mainImageFiles.length > 0) {
        update.images = currentImages;
      }
    } else {
      // If no new files, but we have removed images
      if (req.body.removedImageUrls) {
        const removedUrls = toStringArray(req.body.removedImageUrls);
        if (removedUrls.length > 0) {
          await deleteImages(removedUrls);
          update.images = product.images.filter(img => !removedUrls.includes(img.url));
        }
      }
    }

    // Update Thumbnail if provided
    if (thumbnailFile) {
      // Remove old thumbnail if it exists
      if ((product as any).thumbnail && (product as any).thumbnail.public_id) {
        await deleteImages([(product as any).thumbnail]);
      }
      const thumbResult = await uploadImages([thumbnailFile]);
      if (thumbResult.length > 0) {
        update.thumbnail = thumbResult[0];
      }
    }

    // Process Colors
    if (productData.colors !== undefined) {
      // Logic for colors update is tricky. We get the FULL new list of colors.
      // Some might have existing images (url string in image field?).
      // Some might be new with `imageField`.
      const colorsRaw = parseJSONField(productData.colors); // [{name, image/imageField}]

      const processedColors = await Promise.all(
        colorsRaw.map(async (c: any) => {
          // c: { name: "Red", image: "url..." } OR { name: "Red", imageField: "color_img_..." }
          const colorObj = { name: c.name, image: c.image || "" };

          if (c.imageField) {
            // New upload
            const file = allFiles.find((f) => f.fieldname === c.imageField);
            if (file) {
              const uploaded = await uploadImages([file]);
              if (uploaded[0]) colorObj.image = uploaded[0].url;
            }
          }
          return colorObj;
        })
      );
      update.colors = processedColors;
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate("category", "name")
      .populate("subCategory", "name")
      .populate("brand", "name");

    // Emit socket event
    emitToAdmin(SocketEvents.PRODUCT_UPDATED, {
      productId: id,
      stock: updatedProduct?.stock,
    });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: "product_updated" });

    // Check for low stock
    if (updatedProduct && updatedProduct.stock <= LOW_STOCK_THRESHOLD) {
      emitToAdmin(SocketEvents.STOCK_LOW, {
        productId: id,
        productName: updatedProduct.name,
        stock: updatedProduct.stock,
      });
    }

    res
      .status(200)
      .json(
        ApiResponse.success(
          { product: updatedProduct },
          "Product updated successfully"
        )
      );
  }
);

export const deleteProduct = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid product ID");
    }

    const product = await Product.findById(id);

    if (!product) {
      throw ApiError.badRequest("Product not found");
    }

    await deleteImages(product.images);
    await Product.findByIdAndDelete(id);

    // Emit socket event for real-time dashboard update
    emitToAdmin(SocketEvents.PRODUCT_DELETED, { productId: id });
    emitToAdmin(SocketEvents.DASHBOARD_UPDATE, { type: 'product_deleted' });

    res.status(200).json(ApiResponse.success(null, "Product deleted successfully"));
  }
);




export const createProductReview = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { rating, comment, productId } = req.body;

    if (!productId || !rating) {
      throw ApiError.badRequest("Product ID and rating are required");
    }

    if (!isValidObjectId(productId)) {
      throw ApiError.badRequest("Invalid product ID");
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < MIN_RATING || numRating > MAX_RATING) {
      throw ApiError.badRequest(
        `Rating must be between ${MIN_RATING} and ${MAX_RATING}`
      );
    }

    if (comment && comment.trim().length > MAX_COMMENT_LENGTH) {
      throw ApiError.badRequest(
        `Comment must be less than ${MAX_COMMENT_LENGTH} characters`
      );
    }

    // Check if user has purchased the product and it is delivered
    const order = await Order.findOne({
      user: req.user!._id,
      "orderItems.product": productId,
      orderStatus: "delivered",
    });

    if (!order) {
      throw ApiError.badRequest(
        "You can only review products you have purchased and received."
      );
    }

    const product = await Product.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const review = {
      user: req.user!._id,
      name: req.user!.name,
      rating: numRating,
      comment: comment?.trim() || "",
    };

    const existingReviewIndex = product.reviews.findIndex(
      (rev: any) => rev.user && rev.user.toString() === req.user!._id.toString()
    );

    if (existingReviewIndex !== -1) {
      product.reviews[existingReviewIndex] = {
        ...product.reviews[existingReviewIndex],
        rating: numRating,
        comment: comment?.trim() || "",
      };
    } else {
      product.reviews.push(review as any);
    }

    // Update ratings object
    product.ratings = {
      average: calculateAverageRating(product.reviews as any),
      count: product.reviews.length,
    };

    await product.save({ validateBeforeSave: false });

    res.status(200).json(ApiResponse.success(
      null,
      existingReviewIndex !== -1
        ? "Review updated successfully"
        : "Thank you for your feedback"
    ));
  }
);

export const getUserReviews = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?._id;

    if (!userId) {
      throw ApiError.unauthorized("User not authenticated");
    }

    // Find all products that have reviews by this user

    const products = await Product.find({
      "reviews.user": userId,
    }).select("name images reviews");


    const userReviews: any[] = [];

    products.forEach((product) => {
      const review = product.reviews.find(
        (rev: any) => rev.user && rev.user.toString() === userId.toString()
      );

      if (review) {
        userReviews.push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          productId: product._id,
          productName: product.name,
          productImage: product.images[0]?.url || "",
          createdAt: (review as any).createdAt || new Date(),
        });
      }
    });

    res.status(200).json(
      ApiResponse.success(
        { reviews: userReviews, count: userReviews.length },
        "User reviews retrieved successfully"
      )
    );
  }
);

export const getProductReviews = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id, rating } = req.query;

    if (!id || typeof id !== "string" || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid product ID");
    }

    const product = await Product.findById(id).select("reviews");

    if (!product) {
      throw ApiError.badRequest("Product not found");
    }

    let filteredReviews = product.reviews as any[];
    if (rating) {
      const numRating = Number(rating);
      if (!isNaN(numRating)) {
        filteredReviews = filteredReviews.filter((rev) => rev.rating === numRating);
      }
    }

    res.status(200).json(
      ApiResponse.success(
        {
          reviews: filteredReviews,
          count: filteredReviews.length,
          totalReviewsCount: product.reviews.length,
        })
    );
  }
);

export const deleteReview = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { productId, id } = req.query;

    if (
      !productId ||
      !id ||
      typeof productId !== "string" ||
      typeof id !== "string"
    ) {
      throw ApiError.badRequest("Product ID and review ID are required");
    }

    if (!isValidObjectId(productId) || !isValidObjectId(id)) {
      throw ApiError.badRequest("Invalid ID format");
    }

    const product = await Product.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const reviewExists = product.reviews.some(
      (rev: any) => rev._id.toString() === id
    );

    if (!reviewExists) {
      throw ApiError.notFound("Review not found");
    }

    const reviews = product.reviews.filter(
      (rev: any) => rev._id.toString() !== id
    );

    const average = calculateAverageRating(reviews as any);
    const count = reviews.length;

    await Product.findByIdAndUpdate(
      productId,
      {
        reviews,
        ratings: {
          average,
          count,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );


    res.status(200).json(ApiResponse.success(null, "Review deleted successfully"));
  }
);

export const addToRecentlyViewed = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { productId } = req.body;

    if (!productId) {
      throw ApiError.badRequest("Product ID is required");
    }

    const userId = req.user!._id;

    // 1. Remove if exists to move to top (Atomic Pull)
    await User.findByIdAndUpdate(userId, {
      $pull: { recentlyViewed: productId }
    });

    // 2. Add to front and limit to 10 items (Atomic Push with positioning and slicing)
    await User.findByIdAndUpdate(userId, {
      $push: {
        recentlyViewed: {
          $each: [productId],
          $position: 0,
          $slice: 10
        }
      }
    });

    res.status(200).json(ApiResponse.success(null, "Added to recently viewed"));
  }
);

export const getRecentlyViewedProducts = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = await User.findById(req.user!._id).populate("recentlyViewed");

    if (!user) {
      throw ApiError.notFound("User not found");
    }

    res.status(200).json(ApiResponse.success(user.recentlyViewed));
  }
);
