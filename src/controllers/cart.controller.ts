// file: controllers/cartController.ts
import { Response } from "express";
import mongoose from "mongoose";
import { Cart } from "../models/Cart.model";
import Product from "../models/Product.model";
import User from "../models/User.model";
import Coupon from "../models/Coupon.model";
import Settings from "../models/Settings.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import { AuthRequest } from "../types/index";

/* ---------- Types ---------- */
interface AddToCartBody {
  productId: string;
  quantity?: number;
  variant?: Record<string, any>;
}
interface UpdateCartItemBody {
  quantity: number;
}

/* ---------- Limits ---------- */
const MAX_CART_ITEMS = 50;
const MAX_ITEM_QUANTITY = 99;

/* ---------- Validation helpers ---------- */
const validateQuantity = (quantity: number, stock: number, productName: string): string | null => {
  if (quantity === undefined || quantity === null) return "Quantity is required";
  if (!Number.isInteger(quantity)) return "Quantity must be a whole number";
  if (quantity < 1) return "Quantity must be at least 1";
  if (quantity > MAX_ITEM_QUANTITY) return `Maximum quantity per item is ${MAX_ITEM_QUANTITY}`;
  if (quantity > stock) return `Only ${stock} units of ${productName} available in stock`;
  return null;
};

const validateProduct = (product: any): string | null => {
  if (!product) return "Product not found";
  if (!product.isActive) return "Product is not available";
  if (product.stock <= 0) return "Product is out of stock";
  return null;
};

const variantMatches = (variant1: any, variant2: any): boolean => {
  if (!variant1 && !variant2) return true;
  if (!variant1 || !variant2) return false;
  const k1 = Object.keys(variant1).sort();
  const k2 = Object.keys(variant2).sort();
  if (k1.length !== k2.length) return false;
  return k1.every((k) => variant1[k] === variant2[k]);
};

/* ---------- Controller handlers ---------- */

/**
 * Add item to cart
 * POST /api/cart
 */
export const addToCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as AddToCartBody;
  const productId = body.productId;
  const quantity = body.quantity ?? 1;
  const variant = body.variant ?? null;
  const userId = req.user?._id;

  if (!userId) throw ApiError.unauthorized("User not authenticated");
  if (!productId) throw ApiError.badRequest("Product ID is required");
  if (!mongoose.isValidObjectId(productId)) throw ApiError.badRequest("Invalid product ID");

  // Fetch product (lean for read)
  const product = await Product.findById(productId).lean();
  if (!product) throw ApiError.badRequest("Product not found");

  const prodErr = validateProduct(product);
  if (prodErr) throw ApiError.badRequest(prodErr);

  const qtyErr = validateQuantity(quantity, product.stock, product.name);
  if (qtyErr) throw ApiError.badRequest(qtyErr);

  // Find or create cart document (needs to be a mongoose doc to save)
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] });

  // Find existing item with same product + variant
  const existingIndex = cart.items.findIndex((it: any) => {
    const sameProduct =
      (it.product && it.product.equals && it.product.equals(productId)) ||
      (it.product?.toString && it.product.toString() === productId);
    return sameProduct && variantMatches(it.variant, variant);
  });

  if (existingIndex > -1) {
    const newQuantity = cart.items[existingIndex].quantity + quantity;
    const qErr = validateQuantity(newQuantity, product.stock, product.name);
    if (qErr) throw ApiError.badRequest(qErr);

    cart.items[existingIndex].quantity = newQuantity;
    cart.items[existingIndex].sellingPrice = product.sellingPrice;
    cart.items[existingIndex].maximumRetailPrice = product.maximumRetailPrice;
    cart.items[existingIndex].discount = product.discount || 0;
    cart.items[existingIndex].finalPrice = product.sellingPrice;
    cart.items[existingIndex].stock = product.stock;
    // Update image URL when updating existing item
    cart.items[existingIndex].productImage = (product.images && product.images.length > 0) ? product.images[0].url : "";
  } else {
    if (cart.items.length >= MAX_CART_ITEMS) {
      throw ApiError.badRequest(`Cart cannot exceed ${MAX_CART_ITEMS} different items`);
    }

    cart.items.push({
      product: new mongoose.Types.ObjectId(productId),
      productName: product.name,
      productImage: (product.images && product.images.length > 0) ? product.images[0].url : "", // ✅ FIXED: Extract .url
      quantity,
      sellingPrice: product.sellingPrice,
      maximumRetailPrice: product.maximumRetailPrice,
      discount: product.discount || 0,
      finalPrice: product.sellingPrice,
      variant: variant || null,
      stock: product.stock,
    } as any);
  }

  // Preserve existing coupon/coin state or reset if needed (for now preserving)
  // cart.couponCode = cart.couponCode; 
  // cart.isCoinsRedeemed = cart.isCoinsRedeemed;

  cart.markModified("items");
  await cart.save();

  res.status(200).json(ApiResponse.success(cart, "Item added to cart successfully"));
});

/**
 * Get user's cart
 * GET /api/cart
 */
export const getCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");

  let cart = await Cart.findOne({ user: userId }).populate("user", "name email");

  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
    await cart.save();
  }

  // Batch product fetch to generate warnings
  const productIds = cart.items.map((it: any) => it.product).filter(Boolean);
  const uniqueIds = Array.from(new Set(productIds.map((id: any) => id.toString())));
  const products = uniqueIds.length ? await Product.find({ _id: { $in: uniqueIds } }).lean() : [];
  const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

  const warnings: string[] = [];
  for (const item of cart.items) {
    const pid = item.product?.toString();
    const prod = pid ? productMap.get(pid) : null;
    if (!prod) {
      warnings.push(`${item.productName} is no longer available`);
    } else if (!prod.isActive) {
      warnings.push(`${item.productName} is currently unavailable`);
    } else if (prod.stock < item.quantity) {
      warnings.push(`Only ${prod.stock} units of ${item.productName} available (you have ${item.quantity} in cart)`);
    }
  }

  res.status(200).json(ApiResponse.success({ cart, warnings: warnings.length ? warnings : undefined }));
});

/**
 * Update cart item quantity (itemId is product id in this design)
 * PATCH /api/cart/:itemId
 */
export const updateCartItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { itemId } = req.params;
  const { quantity } = req.body as UpdateCartItemBody;
  const userId = req.user?._id;

  if (!userId) throw ApiError.unauthorized("User not authenticated");
  if (!itemId) throw ApiError.badRequest("Item ID is required");
  if (!mongoose.isValidObjectId(itemId)) throw ApiError.badRequest("Invalid item ID");
  if (quantity === undefined || quantity === null) throw ApiError.badRequest("Quantity is required");

  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw ApiError.notFound("Cart not found");

  const itemIndex = cart.items.findIndex((it: any) => (it.product?.toString && it.product.toString() === itemId));
  if (itemIndex === -1) throw ApiError.notFound("Item not found in cart");

  const product = await Product.findById(itemId).lean();
  if (!product) throw ApiError.badRequest("Product not found");
  const prodErr = validateProduct(product);
  if (prodErr) throw ApiError.badRequest(prodErr);

  const qtyErr = validateQuantity(quantity, product.stock, product.name);
  if (qtyErr) throw ApiError.badRequest(qtyErr);

  cart.items[itemIndex].quantity = quantity;
  cart.items[itemIndex].sellingPrice = product.sellingPrice;
  cart.items[itemIndex].maximumRetailPrice = product.maximumRetailPrice;
  cart.items[itemIndex].discount = product.discount || 0;
  cart.items[itemIndex].finalPrice = product.sellingPrice;
  cart.items[itemIndex].stock = product.stock;

  await cart.save();

  res.status(200).json(ApiResponse.success(cart, "Cart item updated successfully"));
});

/**
 * Remove item from cart
 * DELETE /api/cart/:itemId
 */
export const removeFromCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { itemId } = req.params;
  const userId = req.user?._id;

  if (!userId) throw ApiError.unauthorized("User not authenticated");
  if (!itemId) throw ApiError.badRequest("Item ID is required");
  if (!mongoose.isValidObjectId(itemId)) throw ApiError.badRequest("Invalid item ID");

  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw ApiError.notFound("Cart not found");

  const initialLen = cart.items.length;
  cart.items = cart.items.filter((it: any) => !(it.product?.toString && it.product.toString() === itemId));

  if (cart.items.length === initialLen) throw ApiError.notFound("Item not found in cart");

  await cart.save();

  res.status(200).json(ApiResponse.success(cart, "Item removed from cart successfully"));
});

/**
 * Clear cart
 * DELETE /api/cart
 */
export const clearCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");

  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw ApiError.notFound("Cart not found");

  cart.items = [];
  await cart.save();

  res.status(200).json(ApiResponse.success(cart, "Cart cleared successfully"));
});

/**
 * Sync cart (update prices & stock)
 * POST /api/cart/sync
 */
export const syncCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  const { items: localItems } = req.body;

  if (!userId) throw ApiError.unauthorized("User not authenticated");

  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  // 1. Merge local items if provided (e.g., from local storage after login)
  if (localItems && Array.isArray(localItems)) {
    for (const localItem of localItems) {
      const productId = localItem.product;
      const quantity = localItem.quantity || 1;
      const variant = localItem.variant || null;

      if (!productId || !mongoose.isValidObjectId(productId)) continue;

      const existingIndex = cart.items.findIndex((it: any) => {
        const pid = it.product?.toString();
        return pid === productId.toString() && variantMatches(it.variant, variant);
      });

      if (existingIndex > -1) {
        cart.items[existingIndex].quantity = Math.min(MAX_ITEM_QUANTITY, cart.items[existingIndex].quantity + quantity);
      } else {
        if (cart.items.length < MAX_CART_ITEMS) {
          const product = await Product.findById(productId).lean();
          if (product && product.isActive && product.stock > 0) {
            cart.items.push({
              product: new mongoose.Types.ObjectId(productId),
              productName: product.name,
              productImage: (product.images && product.images.length > 0) ? product.images[0].url : "",
              quantity: Math.min(quantity, product.stock),
              sellingPrice: product.sellingPrice,
              maximumRetailPrice: product.maximumRetailPrice,
              discount: product.discount || 0,
              finalPrice: product.sellingPrice,
              variant: variant || null,
              stock: product.stock,
            } as any);
          }
        }
      }
    }
  }

  // 2. Refresh all items (price, discount, stock, name, image)
  const productIds = cart.items.map((it: any) => it.product).filter(Boolean);
  const uniqueIds = Array.from(new Set(productIds.map((id: any) => id.toString())));
  const products = uniqueIds.length ? await Product.find({ _id: { $in: uniqueIds } }).lean() : [];
  const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

  const updates: string[] = [];
  const removedItems: string[] = [];

  for (let i = cart.items.length - 1; i >= 0; i--) {
    const item = cart.items[i];
    const pid = item.product?.toString();
    const prod = pid ? productMap.get(pid) : null;

    if (!prod || !prod.isActive) {
      removedItems.push(item.productName || "Unknown product");
      cart.items.splice(i, 1);
      continue;
    }

    if (item.sellingPrice !== prod.sellingPrice) {
      updates.push(`${prod.name} price updated from ${item.sellingPrice} to ${prod.sellingPrice}`);
    }

    item.sellingPrice = prod.sellingPrice;
    item.maximumRetailPrice = prod.maximumRetailPrice;
    item.discount = prod.discount || 0;
    item.finalPrice = prod.sellingPrice;
    item.stock = prod.stock;
    item.productName = prod.name;
    item.productImage = (prod.images && prod.images.length > 0) ? prod.images[0].url : "";

    if (item.quantity > prod.stock) {
      updates.push(`${prod.name} quantity reduced to ${prod.stock} (out of stock)`);
      item.quantity = Math.max(1, prod.stock);
    }
  }

  await cart.save();

  return res.status(200).json(ApiResponse.success({
    cart,
    updates: updates.length ? updates : undefined,
    removedItems: removedItems.length ? removedItems : undefined,
  }, "Cart synced successfully"));
});

/**
 * Get cart summary
 * GET /api/cart/summary
 */
export const getCartSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");

  // Fetch cart
  const cart = await Cart.findOne({ user: userId }).lean();


  // Fetch user addresses
  const user = await User.findById(userId).select("addresses email name phone rewardPoints");
  const defaultAddress = user?.addresses?.find((addr: any) => addr.isDefault) || user?.addresses?.[0] || null;

  if (!cart || !cart.items || cart.items.length === 0) {
    return res.status(200).json(ApiResponse.success({
      products: [],
      address: defaultAddress,
      priceDetails: {
        totalMRP: 0,
        totalDiscount: 0,
        shippingFees: 0,
        platformFees: 0,
        totalAmount: 0,
        items: 0
      }
    }));
  }

  // Calculate Price Details
  let totalMRP = 0;
  let totalAmount = 0; // Final amount to pay (excluding extra fees first)

  cart.items.forEach((item: any) => {
    const quantity = item.quantity;
    const itemMRP = (item.maximumRetailPrice || item.sellingPrice) * quantity;
    const itemTotal = item.sellingPrice * quantity;

    totalMRP += itemMRP;
    totalAmount += itemTotal;
  });

  const totalDiscount = totalMRP - totalAmount;

  // Fetch Settings
  const settings = await Settings.findOne();

  // Fee Logic
  const freeDeliveryThreshold = settings?.freeDeliveryThreshold ?? 500;
  const deliveryCharges = settings?.deliveryCharges ?? 40;
  const shippingFees = totalAmount > freeDeliveryThreshold ? 0 : deliveryCharges;

  // Base Total is the amount without shipping or extra tax
  let finalTotalAmount = totalAmount + shippingFees;

  let couponDiscountAmount = 0;
  let coinsDiscountAmount = 0;


  // --- Apply Stored Coupon ---
  if (cart.couponCode) {
    const foundCoupon = await Coupon.findOne({
      code: cart.couponCode,
      isActive: true,
      expiryDate: { $gt: new Date() },
      startDate: { $lte: new Date() },
    });

    if (foundCoupon) {
      if (
        (foundCoupon.usageLimit !== null && foundCoupon.usageLimit !== undefined && foundCoupon.usedCount >= foundCoupon.usageLimit) ||
        (totalAmount < foundCoupon.minPurchaseAmount)
      ) {
        // Coupon invalid, remove it silently or return error in warning? Removing silently for summary view
        cart.couponCode = undefined;
        await Cart.updateOne({ _id: cart._id }, { $unset: { couponCode: 1 } });
      } else {

        if (foundCoupon.discountType === 'percentage') {
          couponDiscountAmount = Math.round((totalAmount * foundCoupon.discountAmount) / 100);
          if (foundCoupon.maxDiscountAmount) {
            couponDiscountAmount = Math.min(couponDiscountAmount, foundCoupon.maxDiscountAmount);
          }
        } else {
          couponDiscountAmount = foundCoupon.discountAmount;
        }
      }
    } else {
      cart.couponCode = undefined;
      await Cart.updateOne({ _id: cart._id }, { $unset: { couponCode: 1 } });
    }
  }

  // --- Apply Coins (after coupon) ---
  if (cart.isCoinsRedeemed && user) {
    const maxPercentage = settings?.maxCoinUsagePercentage || 20;
    const availableCoins = user.rewardPoints || 0;
    const coinValue = settings?.coinValue || 1; // ₹ value per coin

    // Coins are applied on the payable amount after coupon
    const amountAfterCoupon = Math.max(0, finalTotalAmount - couponDiscountAmount);

    // Max coins that can be used based on order value (e.g. 20% of 1000 = 200 coins)
    const orderLimitInCoins = Math.floor((amountAfterCoupon * maxPercentage) / 100);

    // User can use up to what they have OR the order limit, whichever is lower
    const eligibleCoins = Math.min(availableCoins, orderLimitInCoins);

    // Convert coins to ₹ discount
    coinsDiscountAmount = eligibleCoins * coinValue;
  }

  // Ensure total doesn't go negative
  finalTotalAmount = Math.max(0, finalTotalAmount - couponDiscountAmount - coinsDiscountAmount);



  return res.status(200).json(ApiResponse.success({
    products: cart.items,
    address: defaultAddress,
    priceDetails: {
      totalMRP,
      totalDiscount,
      couponDiscount: couponDiscountAmount,
      coinsDiscount: coinsDiscountAmount,
      shippingFees,
      totalAmount: finalTotalAmount,
      items: cart.items.length,
      couponCode: cart.couponCode || null,
      isCoinsRedeemed: cart.isCoinsRedeemed
    }
  }));
});

/* ---------- New Endpoints for Coupon & Coins ---------- */

/**
 * Apply Coupon to Cart
 * POST /api/cart/coupon
 */
export const applyCouponToCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");
  if (!code) throw ApiError.badRequest("Coupon code is required");

  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] });

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    expiryDate: { $gt: new Date() },
    startDate: { $lte: new Date() },
  });

  if (!coupon) throw ApiError.badRequest("Invalid or expired coupon");

  // Validate limits
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest("Coupon usage limit exceeded");
  }

  // Calculate Subtotal for Min Purchase Check
  const subtotal = cart.items.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
  if (subtotal < coupon.minPurchaseAmount) {
    throw ApiError.badRequest(`Minimum purchase of ₹${coupon.minPurchaseAmount} required`);
  }

  cart.couponCode = coupon.code;
  await cart.save();

  res.status(200).json(ApiResponse.success(cart, "Coupon applied successfully"));
});

/**
 * Remove Coupon from Cart
 * DELETE /api/cart/coupon
 */
export const removeCouponFromCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");

  let cart = await Cart.findOne({ user: userId });
  if (cart) {
    cart.couponCode = undefined;
    await cart.save();
  }

  res.status(200).json(ApiResponse.success(cart, "Coupon removed successfully"));
});

/**
 * Toggle Coins in Cart
 * POST /api/cart/coins
 */
export const toggleCartCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { useCoins } = req.body;
  const userId = req.user?._id;
  if (!userId) throw ApiError.unauthorized("User not authenticated");

  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] }); // Should exist usually

  cart.isCoinsRedeemed = !!useCoins;
  await cart.save();

  res.status(200).json(ApiResponse.success(cart, `Coins ${useCoins ? 'applied' : 'removed'} successfully`));
});
