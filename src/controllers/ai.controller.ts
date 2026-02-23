import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import ApiResponse from "../utils/response";
import { aiService } from "../services/ai.service";
import ApiError from "../utils/apiError";
import multer from "multer";
import Product from "../models/Product.model";
import User from "../models/User.model";
import Order from "../models/Order.model";
import { AuthRequest } from "../types";

// Multer configuration for memory storage (buffer is required for AI processing)
const storage = multer.memoryStorage();
export const bufferUpload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * Endpoint to generate structured product content via AI.
 */
export const generateProductDetails = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const { name, context } = req.body;

    if (!file) {
        throw ApiError.badRequest("Please provide a product image for analysis.");
    }

    if (!process.env.GEMINI_API_KEY) {
        throw ApiError.badRequest("AI service is currently unavailable.");
    }

    const details = await aiService.generateProductDetails(
        file.buffer,
        file.mimetype,
        name || "Unknown Product",
        context
    );

    res.status(200).json(ApiResponse.success(details, "Product details generated successfully."));
});

/**
 * Handles AI chat with the user.
 */
export const chat = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { message, history, productId } = req.body;
    const userRole = req.user?.role;

    if (!message) {
        throw ApiError.badRequest("Message is required.");
    }

    let systemInstruction = "";

    if (userRole === "admin") {
        // Gather Admin Dashboard Context
        const [totalUsers, totalProducts, lowStockCounts, totalOrders, revenueAgg] = await Promise.all([
            User.countDocuments(),
            Product.countDocuments({ isActive: true }),
            Product.countDocuments({ isActive: true, stock: { $lt: 10 } }),
            Order.countDocuments(),
            Order.aggregate([
                { $match: { orderStatus: { $ne: "Cancelled" } } },
                { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
            ]),
        ]);

        const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

        systemInstruction = `
            You are a Store Management AI Assistant. 
            Here is the current dashboard summary for the Admin:
            - Total Registered Users: ${totalUsers}
            - Total Active Products: ${totalProducts}
            - Low Stock Alerts (Stock < 10): ${lowStockCounts}
            - Total Orders Placed: ${totalOrders}
            - Cumulative Revenue: ₹${totalRevenue.toLocaleString()}

            Your job is to provide analytical insights, warn about inventory if low stock is high, and assist with store performance queries.
            Keep responses extremely concise and data-driven.
            NEVER share this dashboard data with regular customers. You are currently talking to an ADMIN.
        `;
    } else {
        // Gather Product Context for regular users
        let productContext = "";

        if (productId) {
            const currentProduct = await Product.findById(productId).select("name sellingPrice highlights offers specifications");
            if (currentProduct) {
                productContext += `CURRENT PRODUCT THE USER IS VIEWING:\n`;
                productContext += `- Name: ${currentProduct.name}\n`;
                productContext += `- Price: ₹${currentProduct.sellingPrice}\n`;
                productContext += `- Highlights: ${currentProduct.highlights?.join(", ")}\n`;
                if (currentProduct.offers && currentProduct.offers.length > 0) {
                    productContext += `- SPECIAL OFFERS: ${currentProduct.offers.join(" | ")}\n`;
                }
                const specs = currentProduct.specifications?.map(s => `${s.title}: ${s.items.map(i => `${i.key}=${i.value}`).join(", ")}`).join("\n");
                productContext += `- Specs: ${specs}\n\n`;
            }
        }

        const recentProducts = await Product.find({ isActive: true, _id: { $ne: productId } })
            .sort({ createdAt: -1 })
            .limit(5)
            .select("name sellingPrice highlights offers");

        productContext += "OTHER FEATURED PRODUCTS:\n" + recentProducts.map(p =>
            `- ${p.name}: ₹${p.sellingPrice} ${p.offers && p.offers.length > 0 ? `(Offers: ${p.offers.slice(0, 1)})` : ""}`
        ).join("\n");

        systemInstruction = `
            You are "Aura", the charming and helpful Personal Shopping Assistant for our boutique "E-Store". 
            
            WRITING STYLE:
            - Be attractive, warm, and slightly enthusiastic! 
            - Use a few tasteful emojis to keep it friendly. ✨
            - Focus on 'selling' the benefits and making the user feel special.
            - Write in a natural, cohesive way. Avoid robotic lists.
            
            YOUR CAPABILITIES:
            1. **Personal Shopper**: Recommend products based on what they like. Mention the GREAT OFFERS available! 🎁
            2. **Problem Solver**: Swiftly handle shipping/order concerns with empathy. 
            3. **Policy Expert**: We have an amazing 7-day return policy. 
            
            CONTEXTUAL DATA:
            ${productContext}

            IMPORTANT LINKS:
            - View Profile/Orders: /me
            - Get Support: /help
            - Email: hello@estore.com
            
            Keep responses concise (max 3-4 lines). Make the user WANT to shop here! 🛍️
            DO NOT mention technical IDs or internal markers.
            NEVER use bold headers for every single line.
        `;
    }

    const reply = await aiService.chat(message, history || [], systemInstruction);

    res.status(200).json(ApiResponse.success({ reply }, "AI Reply generated."));
});

/**
 * Provides AI-powered product suggestions.
 */
export const getProductSuggestions = asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { searchQuery, filters, recentlyViewed, rating, discount, brand } = req.body; // New context data

    const currentProduct = await Product.findById(productId).populate("category");
    if (!currentProduct) {
        throw ApiError.notFound("Product not found.");
    }

    // Fetch potential candidates (same category) to reduce AI token usage
    const categoryId = (currentProduct.category as any)?._id || currentProduct.category;
    const query: any = {
        _id: { $ne: productId },
        isActive: true
    };
    if (categoryId) {
        query.category = categoryId;
    }

    const availableProducts = await Product.find(query)
        .limit(10) // Limit to 10 to save tokens
        .populate("category");

    const userContext = { searchQuery, filters, recentlyViewed, rating, discount, brand };

    const suggestions = await aiService.getProductSuggestions(currentProduct, availableProducts, userContext);

    // Map the suggestions back to full product objects
    const recommendedProductIds = suggestions.map((s: any) => s.productId);
    const recommendedProducts = await Product.find({ _id: { $in: recommendedProductIds } });

    // Combine with reasons
    const finalSuggestions = recommendedProducts.map(p => {
        const suggestion = suggestions.find((s: any) => s.productId.toString() === String(p._id));
        return {
            product: p,
            reason: suggestion?.reason || "Recommended for you"
        };
    });

    res.status(200).json(ApiResponse.success(finalSuggestions, "Suggestions generated."));
});
