import { Request, Response } from "express";
import Product from "../models/Product.model";
import { Category } from "../models/Category.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiResponse from "../utils/response";

/**
 * Controller to provide data for dynamic sitemap generation.
 * This can be consumed by the frontend to build a sitemap.xml
 */
export const getSitemapData = asyncHandler(async (req: Request, res: Response) => {
    const [products, categories] = await Promise.all([
        Product.find({ isActive: true }).select("slug updatedAt images"),
        Category.find().select("name"),
    ]);

    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

    const data = {
        products: products.map((p: any) => ({
            url: `${baseUrl}/product/${p.slug}`,
            lastmod: p.updatedAt,
            priority: 0.8,
            changefreq: 'daily',
            image: p.images?.[0]?.url || null,
        })),
        categories: categories.map((c: any) => ({
            url: `${baseUrl}/search?category=${encodeURIComponent(c.name)}`,
            priority: 0.7,
            changefreq: 'weekly',
        })),
        staticPages: [
            { url: `${baseUrl}/`, priority: 1.0, changefreq: 'daily' },
            { url: `${baseUrl}/cart`, priority: 0.5, changefreq: 'monthly' },
            { url: `${baseUrl}/help`, priority: 0.4, changefreq: 'monthly' },
            { url: `${baseUrl}/legal/terms`, priority: 0.3, changefreq: 'yearly' },
            { url: `${baseUrl}/legal/privacy`, priority: 0.3, changefreq: 'yearly' },
            { url: `${baseUrl}/legal/shipping`, priority: 0.3, changefreq: 'yearly' },
            { url: `${baseUrl}/legal/refund`, priority: 0.3, changefreq: 'yearly' },
        ]
    };

    res.status(200).json(ApiResponse.success(data, "Sitemap data retrieved"));
});
