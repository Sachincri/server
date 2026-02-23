import { Request, Response } from "express";
import mongoose from "mongoose";
import { HomePageCMS, IHomePageCMS } from "../models/Home.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";
import {
    uploadOnCloudinary,
    deleteFromCloudinary,
} from "../utils/uploadOnCloudinary";
import {
    validateCarousel,
    validateSections,
    validateSEO,
} from "../validators/homeValidator";
import { AuthRequest } from "../types/index";

/* ---------- Helper Functions ---------- */

/**
 * Validate home page data
 */
async function validateHomePageData(
    homeData: Partial<IHomePageCMS>,
    excludeId?: mongoose.Types.ObjectId
): Promise<void> {
    const errors: string[] = [];

    if (homeData.seo) errors.push(...validateSEO(homeData.seo));
    if (homeData.carousel) errors.push(...validateCarousel(homeData.carousel));
    if (homeData.sections) errors.push(...validateSections(homeData.sections));

    if (errors.length > 0) {
        throw ApiError.validationError(errors.map((m) => ({ message: m })));
    }

    // Check slug uniqueness
    if (homeData.seo?.slug) {
        const query: any = { "seo.slug": homeData.seo.slug };
        if (excludeId) query._id = { $ne: excludeId };

        const existing = await HomePageCMS.findOne(query).lean();
        if (existing) {
            throw ApiError.badRequest(
                `A page with slug "${homeData.seo.slug}" already exists`
            );
        }
    }
}

/**
 * Ensure only one active home page exists
 */
async function ensureSingleActivePage(
    activePageId: mongoose.Types.ObjectId
): Promise<void> {
    await HomePageCMS.updateMany(
        { _id: { $ne: activePageId }, isActive: true },
        { isActive: false }
    );
}

/**
 * Check if user is admin
 */
function requireAdmin(req: AuthRequest): void {
    if (!req.user || req.user.role !== "admin") {
        throw ApiError.forbidden("Admin access required");
    }
}

/**
 * Robustly set a nested property in an object using a string path
 * Supports "a.b.c" or "items[0].image"
 */
function setNestedProperty(obj: any, path: string, value: any) {

    const parts = path.split(/[\.\[\]]+/).filter(Boolean);
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
            const nextPart = parts[i + 1];
            current[part] = /^\d+$/.test(nextPart) ? [] : {};
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];

    current[lastPart] = value;
}

/**
 * Get a nested property from an object using a string path
 */
function getNestedProperty(obj: any, path: string): any {
    const parts = path.split(/[\.\[\]]+/).filter(Boolean);
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    return current;
}

/**
 * Extract all public_ids from a document or object
 */
function extractPublicIds(obj: any): string[] {
    const ids: string[] = [];
    if (!obj || typeof obj !== 'object') return ids;

    if (obj.public_id && typeof obj.public_id === 'string') {
        ids.push(obj.public_id);
        return ids; // Found it at this level
    }

    if (Array.isArray(obj)) {
        obj.forEach(item => ids.push(...extractPublicIds(item)));
    } else {
        for (const key in obj) {
            ids.push(...extractPublicIds(obj[key]));
        }
    }
    return ids;
}

/**
 * Delete multiple images from Cloudinary
 */
async function deleteMultipleImages(publicIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(publicIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    await Promise.allSettled(uniqueIds.map(id => deleteFromCloudinary(id)));
}

/**
 * Process the request to extract data from JSON payload, flat fields, and files.
 */
async function processRequestData(req: Request, oldDoc?: any): Promise<{ homeData: any, replacedImages: string[] }> {
    let homeData: any = {};
    const replacedImages: string[] = [];

    // 1. Parse JSON payload if exists
    if (req.body.payload) {
        try {
            homeData = JSON.parse(req.body.payload);

        } catch (e) {
            console.error("❌ Failed to parse payload:", e);
        }
    } else if (req.body.data) {
        try {
            homeData = JSON.parse(req.body.data);

        } catch (e) {
            console.error("❌ Failed to parse data:", e);
        }
    } else {
        homeData = { ...req.body };
        delete homeData.payload;
        delete homeData.data;

    }

    // 2. Expand any flat keys in homeData (e.g. "carousel.items.0.title")
    const flatData = { ...homeData };
    const expandedData: any = {};
    Object.keys(flatData).forEach(key => {
        if (key.includes('.') || key.includes('[')) {

            setNestedProperty(expandedData, key, flatData[key]);
        } else {
            expandedData[key] = flatData[key];
        }
    });
    homeData = expandedData;

    // 3. Handle uploaded files
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {

        for (const file of files) {

            const result = await uploadOnCloudinary(file.path, {
                folder: "home-cms",
            });

            if (result && result.public_id && result.secure_url) {
                const fileData = {
                    public_id: result.public_id,
                    url: result.secure_url,
                };

                // Track replaced images for cleanup if oldDoc is provided
                if (oldDoc) {
                    const oldVal = getNestedProperty(oldDoc, file.fieldname);
                    if (oldVal && oldVal.public_id) {

                        replacedImages.push(oldVal.public_id);
                    }
                }


                setNestedProperty(homeData, file.fieldname, fileData);
            } else {
                console.error(`❌ Cloudinary upload failed for ${file.fieldname}`);
            }
        }
    }

    return { homeData, replacedImages };
}

/* ---------- Controllers ---------- */

/**
 * Create Home page
 * POST /api/admin/home
 * @access Private/Admin
 */
export const createHomePage = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        try {

            requireAdmin(req);

            // 1. Initial parse to identify the page slug (default to "home")
            let slug = "home";
            try {
                const initialData = req.body.payload
                    ? JSON.parse(req.body.payload)
                    : (req.body.data ? JSON.parse(req.body.data) : req.body);
                slug = initialData.seo?.slug || initialData["seo.slug"] || "home";
            } catch (e) {
                console.warn("⚠️ Could not pre-parse slug from body, using default 'home'");
            }


            const existing = await HomePageCMS.findOne({ "seo.slug": slug });

            let finalHomeData: any;
            let replacedImages: string[] = [];

            if (existing) {

                // Process request with existing doc for image replacement tracking
                const processed = await processRequestData(req, existing.toObject());
                finalHomeData = processed.homeData;
                replacedImages = processed.replacedImages;

                // Validate (excluding current doc)
                await validateHomePageData(finalHomeData, existing._id as mongoose.Types.ObjectId);


                const updated = await HomePageCMS.findByIdAndUpdate(
                    existing._id,
                    finalHomeData,
                    { new: true, runValidators: true }
                );

                // Cleanup replaced images from Cloudinary
                if (replacedImages.length > 0) {

                    await deleteMultipleImages(replacedImages);
                }

                if (finalHomeData.isActive && !existing.isActive) {
                    await ensureSingleActivePage(updated!._id as mongoose.Types.ObjectId);
                }


                return res.status(200).json(
                    ApiResponse.success(updated, "Home page updated successfully")
                );
            }

            // No existing page Found - Create New

            const processed = await processRequestData(req);
            finalHomeData = processed.homeData;

            await validateHomePageData(finalHomeData);

            const homePage = await HomePageCMS.create(finalHomeData);

            if (homePage.isActive) {
                await ensureSingleActivePage(homePage._id as mongoose.Types.ObjectId);
            }


            return res.status(201).json(
                ApiResponse.created(homePage, "Home page created successfully")
            );
        } catch (error: any) {
            console.error("❌ createHomePage Error:", error);
            if (error.code === 11000) {
                throw ApiError.badRequest("A home page with this slug already exists. Please update the existing one.");
            }
            throw error;
        }
    }
);

/**
 * Update Home page
 * PUT /api/admin/home/:id
 * @access Private/Admin
 */
export const updateHomePage = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        try {

            requireAdmin(req);
            const { id } = req.params;

            if (!mongoose.isValidObjectId(id)) {
                console.warn("⚠️ Invalid ObjectId provided:", id);
                throw ApiError.badRequest("Invalid ID");
            }

            const homePage = await HomePageCMS.findById(id);
            if (!homePage) {
                console.warn("⚠️ Home page not found for ID:", id);
                throw ApiError.notFound("Home page not found");
            }


            const { homeData, replacedImages } = await processRequestData(req, homePage.toObject());


            await validateHomePageData(homeData, homePage._id as mongoose.Types.ObjectId);



            const updated = await HomePageCMS.findByIdAndUpdate(
                homePage._id,
                homeData,
                { new: true, runValidators: true }
            );

            // Delete replaced images from Cloudinary
            if (replacedImages.length > 0) {

                await deleteMultipleImages(replacedImages);
            }

            // If activating this page, deactivate others
            if (homeData.isActive && !homePage.isActive) {

                await ensureSingleActivePage(updated!._id as mongoose.Types.ObjectId);
            }


            return res.status(200).json(
                ApiResponse.success(updated, "Home page updated successfully")
            );
        } catch (error: any) {
            console.error("❌ updateHomePage Error:", error);
            // Re-throw to be caught by asyncHandler if it's an ApiError, 
            // or let it bubble up if it's a 500
            throw error;
        }
    }
);

/**
 * Get active home page
 * GET /api/home
 * @access Public
 */
export const getActiveHomePage = asyncHandler(
    async (req: Request, res: Response) => {
        const homePage = await HomePageCMS.findOne({ isActive: true }).lean();

        if (!homePage) throw ApiError.notFound("No active home page found");

        // Cache for 5 minutes
        res.set("Cache-Control", "public, max-age=300");
        return res.status(200).json(ApiResponse.success(homePage));
    }
);

/**
 * Get home page by ID
 * GET /api/home/id/:id
 * @access Public
 */
export const getHomePageById = asyncHandler(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            throw ApiError.badRequest("Invalid ID");
        }

        const homePage = await HomePageCMS.findById(id).lean();
        if (!homePage) throw ApiError.notFound("Home page not found");

        return res.status(200).json(ApiResponse.success(homePage));
    }
);

/**
 * Get home page by slug
 * GET /api/home/slug/:slug
 * @access Public
 */
export const getHomePageBySlug = asyncHandler(
    async (req: Request, res: Response) => {
        const { slug } = req.params;

        const homePage = await HomePageCMS.findOne({ "seo.slug": slug }).lean();
        if (!homePage) throw ApiError.notFound("Home page not found");

        return res.status(200).json(ApiResponse.success(homePage));
    }
);

/**
 * List home pages with pagination
 * GET /api/admin/home?page=1&limit=10&isActive=true
 * @access Private/Admin
 */
export const getAllHomePages = asyncHandler(
    async (req: AuthRequest, res: Response) => {

        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
        const skip = (page - 1) * limit;

        const query: any = {};
        if (req.query.isActive !== undefined) {
            query.isActive = String(req.query.isActive) === "true";
        }

        const [data, total] = await Promise.all([
            HomePageCMS.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            HomePageCMS.countDocuments(query),
        ]);

        return res.status(200).json(
            ApiResponse.success({
                data,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                },
            })
        );
    }
);

/**
 * Delete home page by ID
 * DELETE /api/admin/home/:id
 * @access Private/Admin
 */
export const deleteHomePage = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        requireAdmin(req);
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            throw ApiError.badRequest("Invalid ID");
        }

        const homePage = await HomePageCMS.findById(id);
        if (!homePage) throw ApiError.notFound("Home page not found");

        const publicIds = extractPublicIds(homePage.toObject());

        await homePage.deleteOne();

        // Cleanup images from Cloudinary
        if (publicIds.length > 0) {
            await deleteMultipleImages(publicIds);
        }

        return res.status(200).json(
            ApiResponse.success(homePage, "Home page and associated images deleted successfully")
        );
    }
);

/**
 * Toggle isActive status
 * PATCH /api/admin/home/:id/toggle
 * @access Private/Admin
 */
export const toggleHomePageStatus = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        requireAdmin(req);
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            throw ApiError.badRequest("Invalid ID");
        }

        const homePage = await HomePageCMS.findById(id);
        if (!homePage) throw ApiError.notFound("Home page not found");

        homePage.isActive = !homePage.isActive;
        await homePage.save();

        // If activating, deactivate others
        if (homePage.isActive) {
            await ensureSingleActivePage(homePage._id as mongoose.Types.ObjectId);
        }

        return res.status(200).json(
            ApiResponse.success(
                homePage,
                `Home page ${homePage.isActive ? "activated" : "deactivated"
                } successfully`
            )
        );
    }
);


/**
 * Update SEO Settings
 * PATCH /api/admin/home/:id/seo
 */
export const updateSEO = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id } = req.params;
    let seoData = req.body.seo || req.body;

    if (req.body.payload) {
        try { seoData = JSON.parse(req.body.payload); } catch (e) { }
    } else if (typeof seoData === 'string') {
        try { seoData = JSON.parse(seoData); } catch (e) { }
    }

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    // Handle OG Image upload if present
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
        const file = files.find(f => f.fieldname === 'ogImage');
        if (file) {
            const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
            if (result) {
                // Delete old image if it exists
                if (homePage.seo.ogImage) {
                    if (typeof homePage.seo.ogImage === 'string') {
                        // Legacy string url - can't easily get public_id unless we parse or it was stored differently.
                        // Assuming new uploads will be objects. Old strings might be lost leftovers or we ignore deleting them.
                    } else if (typeof homePage.seo.ogImage === 'object') {
                        const ids = extractPublicIds(homePage.seo.ogImage);
                        if (ids.length > 0) await deleteMultipleImages(ids);
                    }
                }
                seoData.ogImage = {
                    public_id: result.public_id,
                    url: result.secure_url
                };
            }
        }
    }

    // Merge SEO data
    homePage.seo = { ...homePage.seo, ...seoData };
    await homePage.save();

    res.status(200).json(ApiResponse.success(homePage, "SEO settings updated"));
});

/**
 * Update Carousel
 * PATCH /api/admin/home/:id/carousel
 */
export const updateCarousel = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id } = req.params;
    let items = req.body.items;

    if (req.body.payload) {
        try {
            const parsed = JSON.parse(req.body.payload);
            items = parsed.items || parsed;
        } catch (e) { }
    } else if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { }
    }

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    const files = req.files as Express.Multer.File[];

    // Verify items is an array
    if (!Array.isArray(items)) {
        throw ApiError.badRequest("Invalid items format. Expected an array.");
    }

    // Helper to process items
    const processedItems = [...items];

    // Map uploaded files to their items
    if (files && files.length > 0) {
        for (const file of files) {
            // Fieldname format: "items[0][image]" or just "0" depending on how frontend sends it
            // Let's assume frontend sends "items.0.image" or similar, or we map by index
            const match = file.fieldname.match(/items\.(\d+)\.image/);
            if (match) {
                const index = parseInt(match[1]);
                if (processedItems[index]) {
                    const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
                    if (result) {
                        // Delete old image if exists
                        const oldItem = homePage.carousel.items[index];
                        if (oldItem && oldItem.image && (oldItem.image as any).public_id) {
                            await deleteFromCloudinary((oldItem.image as any).public_id);
                        }

                        processedItems[index].image = {
                            public_id: result.public_id,
                            url: result.secure_url
                        };
                    }
                }
            }
        }
    }

    homePage.carousel.items = processedItems;
    await homePage.save();

    res.status(200).json(ApiResponse.success(homePage, "Carousel updated"));
});

/**
 * Add New Section
 * POST /api/admin/home/:id/sections
 */
export const addSection = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id } = req.params;
    let sectionData = req.body;

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    // Auto-increment order
    const maxOrder = homePage.sections.reduce((max, s) => Math.max(max, s.order || 0), 0);
    sectionData.order = maxOrder + 1;

    // Create new section object
    // Note: Validation happens at model level or we can valid here
    homePage.sections.push(sectionData);
    await homePage.save();

    res.status(200).json(ApiResponse.success(homePage, "Section added"));
});

/**
 * Update Section
 * PATCH /api/admin/home/:id/sections/:sectionId
 */
export const updateSection = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id, sectionId } = req.params;

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    const sectionIndex = homePage.sections.findIndex(s => (s as any)._id?.toString() === sectionId);
    if (sectionIndex === -1) throw ApiError.notFound("Section not found");

    // Handle file uploads for this section
    const files = req.files as Express.Multer.File[];
    let sectionData = req.body;

    // Parse if stringified (common with FormData)
    if (req.body.payload) {
        try { sectionData = JSON.parse(req.body.payload); } catch (e) { }
    }

    const currentSection = homePage.sections[sectionIndex];

    // Merge data - complicated due to nested structure (banners vs products)
    // Simplified: we expect the FULL section object to be sent back, with updated non-file fields.
    // We only overlay the NEW files.

    if (sectionData.type === 'products') {
        const newProducts = { ...sectionData.products };

        if (files && files.length > 0) {
            for (const file of files) {
                // Expected format: "products.items.0.image"
                const match = file.fieldname.match(/products\.items\.(\d+)\.image/);
                if (match) {
                    const idx = parseInt(match[1]);
                    if (newProducts.items && newProducts.items[idx]) {
                        const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
                        if (result) {
                            // Delete old
                            const oldItem = currentSection.products?.items?.[idx];
                            if (oldItem && oldItem.image && (oldItem.image as any).public_id) {
                                await deleteFromCloudinary((oldItem.image as any).public_id);
                            }

                            newProducts.items[idx].image = { public_id: result.public_id, url: result.secure_url };
                        }
                    }
                }
            }
        }
        (homePage.sections[sectionIndex] as any).products = newProducts;
    } else if (sectionData.type === 'quad_grid') {
        const newQuads = [...(sectionData.quads || [])];
        if (files && files.length > 0) {
            for (const file of files) {
                // Expected format: "quads.0.items.0.image"
                const match = file.fieldname.match(/quads\.(\d+)\.items\.(\d+)\.image/);
                if (match) {
                    const qIdx = parseInt(match[1]);
                    const iIdx = parseInt(match[2]);
                    if (newQuads[qIdx] && newQuads[qIdx].items && newQuads[qIdx].items[iIdx]) {
                        const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
                        if (result) {
                            // Delete old image if exists
                            const oldItem = currentSection.quads?.[qIdx]?.items?.[iIdx];
                            if (oldItem && oldItem.image && (oldItem.image as any).public_id) {
                                await deleteFromCloudinary((oldItem.image as any).public_id);
                            }
                            newQuads[qIdx].items[iIdx].image = { public_id: result.public_id, url: result.secure_url };
                        }
                    }
                }
            }
        }
        (homePage.sections[sectionIndex] as any).quads = newQuads;
    } else {
        // Banners
        const newBanners = [...(sectionData.banners || [])];
        if (files && files.length > 0) {
            for (const file of files) {
                // Expected format: "banners.0.image"
                const match = file.fieldname.match(/banners\.(\d+)\.image/);
                if (match) {
                    const idx = parseInt(match[1]);
                    if (newBanners[idx]) {
                        const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
                        if (result) {
                            const oldBanner = currentSection.banners?.[idx];
                            if (oldBanner && oldBanner.image && (oldBanner.image as any).public_id) {
                                await deleteFromCloudinary((oldBanner.image as any).public_id);
                            }

                            newBanners[idx].image = { public_id: result.public_id, url: result.secure_url };
                        }
                    }
                }
            }
        }
        (homePage.sections[sectionIndex] as any).banners = newBanners;
    }

    // Update other top-level section fields
    if (sectionData.order) (homePage.sections[sectionIndex] as any).order = sectionData.order;
    if (sectionData.bgColor !== undefined) (homePage.sections[sectionIndex] as any).bgColor = sectionData.bgColor;
    if (sectionData.bgGradient !== undefined) (homePage.sections[sectionIndex] as any).bgGradient = sectionData.bgGradient;

    await homePage.save();
    res.status(200).json(ApiResponse.success(homePage, "Section updated"));
});

/**
 * Remove Section
 * DELETE /api/admin/home/:id/sections/:sectionId
 */
export const removeSection = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id, sectionId } = req.params;

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    const section = homePage.sections.find(s => (s as any)._id?.toString() === sectionId);
    if (!section) throw ApiError.notFound("Section not found");

    // Cleanup images
    const publicIds = extractPublicIds(section);
    if (publicIds.length > 0) await deleteMultipleImages(publicIds);

    homePage.sections = homePage.sections.filter(s => (s as any)._id?.toString() !== sectionId);
    await homePage.save();

    res.status(200).json(ApiResponse.success(homePage, "Section removed"));
});

/**
 * Reorder Sections
 * PATCH /api/admin/home/:id/reorder-sections
 */
export const reorderSections = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id } = req.params;
    const { orderMapping } = req.body; // { [sectionId]: newOrder }

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    homePage.sections.forEach(section => {
        const secId = (section as any)._id?.toString();
        if (orderMapping[secId] !== undefined) {
            section.order = orderMapping[secId];
        }
    });

    // Sort to be safe before saving/returning
    homePage.sections.sort((a, b) => a.order - b.order);

    await homePage.save();
    res.status(200).json(ApiResponse.success(homePage, "Sections reordered"));
});

/**
 * Update Header Settings
 * PATCH /api/admin/home/:id/header
 */
export const updateHeader = asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);
    const { id } = req.params;

    const homePage = await HomePageCMS.findById(id);
    if (!homePage) throw ApiError.notFound("Home page not found");

    // Handle Header Logo upload if present
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
        const file = files.find(f => f.fieldname === 'headerLogo');
        if (file) {
            const result = await uploadOnCloudinary(file.path, { folder: "home-cms" });
            if (result) {
                // Delete old image if it exists
                if (homePage.headerLogo && homePage.headerLogo.public_id) {
                    await deleteFromCloudinary(homePage.headerLogo.public_id);
                }
                homePage.headerLogo = {
                    public_id: result.public_id,
                    url: result.secure_url
                };
            }
        }
    }

    await homePage.save();
    res.status(200).json(ApiResponse.success(homePage, "Header settings updated"));
});


