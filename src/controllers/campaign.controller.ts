import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import User from "../models/User.model";
import { Cart } from "../models/Cart.model";
import Product from "../models/Product.model";
import { Category } from "../models/Category.model";
import { Brand } from "../models/Brand.model";
import Settings from "../models/Settings.model";
import HomePageCMS from "../models/Home.model";
import { aiService } from "../services/ai.service";
import emailService from "../services/email.Service";
import { sendPushNotification, sendWhatsAppMessage } from "../utils/notification";

/**
 * Builds a lightweight store context snapshot from DB for AI enrichment.
 * Fetches top products, categories, and brands so the AI understands
 * what the store actually sells.
 */
async function buildStoreContext() {
    try {
        const [topProducts, categories, brands] = await Promise.all([
            Product.find({ isActive: true })
                .sort({ "ratings.average": -1, createdAt: -1 })
                .limit(10)
                .select("name sellingPrice category description highlights")
                .populate("category", "name")
                .lean(),
            Category.find({ isActive: true, level: 0 })
                .select("name description")
                .limit(15)
                .lean(),
            Brand.find({ isActive: true })
                .select("name")
                .limit(10)
                .lean(),
        ]);

        const productSummaries = topProducts.map((p: any) => ({
            name: p.name,
            price: `₹${p.sellingPrice}`,
            category: p.category?.name || "General",
            highlights: (p.highlights || []).slice(0, 2),
        }));

        const categoryNames = categories.map((c: any) => c.name);
        const brandNames = brands.map((b: any) => b.name);

        return {
            products: productSummaries,
            categories: categoryNames,
            brands: brandNames,
            summary: `Store sells: ${categoryNames.join(", ") || "various products"}. Top brands: ${brandNames.join(", ") || "in-house"}. Featured products: ${productSummaries.map(p => p.name).join(", ") || "various items"}.`
        };
    } catch (error) {
        console.warn("Could not build store context:", error);
        return null;
    }
}

/**
 * Generate AI Campaign Content
 * 1. Generates structured text copy (appPush, whatsapp, email, imagePrompt) via Gemini
 * 2. Uses the imagePrompt to generate a campaign banner via Nvidia SDXL
 * 3. Injects the generated image into the email HTML (replaces {{HERO_IMAGE_URL}})
 * 4. Returns a flat response for the frontend
 */
export const generateCampaignDetails = asyncHandler(async (_req: Request, _res: Response) => {
    const { topic, type, channels = ["push", "whatsapp", "email"], storeName, context } = _req.body;

    if (!topic || !type) {
        return _res.status(400).json({ status: "error", message: "Topic and campaign type are required." });
    }

    try {
        // 0. Fetch real store context (products, categories, brands) for AI enrichment
        const storeContext = await buildStoreContext();

        // Fetch CMS data early to get branding
        const cms = await HomePageCMS.findOne({ isActive: true }).select('storeName headerLogo');
        const activeStoreName = storeName || cms?.storeName || "Our Store";
        const storeLogoUrl = cms?.headerLogo?.url || null;

        // 1. Generate structured copy using Gemini (returns { appPush, whatsapp, email, imagePrompt })
        // Now passing the user-provided 'context' for visual direction
        const copy = await aiService.generateStandardCampaignCopy(topic, type, channels, activeStoreName, storeContext, context);

        // 2. Generate campaign banner image using the AI-crafted imagePrompt
        let imageUrl: string | null = null;
        if (copy.imagePrompt) {
            // Enrich the image prompt with store context AND user context for more relevant visuals
            let enrichedImagePrompt = copy.imagePrompt;

            // If the user provided specific visual context, ensure it's explicitly part of the final prompt
            if (context) {
                enrichedImagePrompt = `${enrichedImagePrompt}. Visual context: ${context}`;
            }

            if (storeContext) {
                enrichedImagePrompt = `${enrichedImagePrompt}. Store context: ${storeContext.summary}`;
            }

            imageUrl = await aiService.generateCampaignImageViaNvidia(enrichedImagePrompt);
        }

        // 3. Inject the generated image URL and Store Link into the email HTML
        let emailHtml = copy.email?.htmlBody || "";

        const storeLink = process.env.FRONTEND_URL || "https://yourstore.com";
        emailHtml = emailHtml.replace(/\{\{SHOP_LINK\}\}/g, storeLink);

        if (imageUrl) {
            emailHtml = emailHtml.replace(/\{\{HERO_IMAGE_URL\}\}/g, imageUrl);
        } else {
            // Remove the broken img tag if no image was generated
            emailHtml = emailHtml.replace(/<img[^>]*\{\{HERO_IMAGE_URL\}\}[^>]*\/?>/gi, "");
        }

        // 4. Return flat response for frontend compatibility
        return _res.status(200).json({
            status: "success",
            data: {
                pushTitle: copy.appPush?.title || "",
                pushBody: copy.appPush?.body || "",
                pushDeepLink: storeLink, // Universal Link: OS will open app if installed, else fallback to web
                whatsappText: copy.whatsapp?.body || "",
                whatsappButtons: copy.whatsapp?.buttons || [],
                emailSubject: copy.email?.subject || "",
                emailHtml,
                imageUrl,
                storeName: activeStoreName,
                storeLogo: storeLogoUrl
            }
        });
    } catch (error: any) {
        console.error("Campaign Generation Error:", error.message);
        return _res.status(500).json({ status: "error", message: "Failed to generate campaign assets." });
    }
});

/**
 * Broadcast Generated Campaign
 * Sends the generated AI campaign out to users based on target audience
 */
export const broadcastGeneratedCampaign = asyncHandler(async (req: Request, res: Response) => {
    const { audienceType, channels, payload } = req.body;

    if (!payload) {
        return res.status(400).json({ status: "error", message: "Campaign payload is required" });
    }

    const settings = await Settings.findOne();
    let users = [];

    // Simple audience logic block
    if (audienceType?.toLowerCase().includes("abandoned cart")) {
        // Find users with items in cart
        const activeCarts = await Cart.find({ "items": { $exists: true, $not: { $size: 0 } } })
            .populate("user", "name pushToken phone email");
        users = activeCarts.map(cart => cart.user).filter(Boolean);
    } else if (audienceType?.toLowerCase().includes("viewed")) {
        users = await User.find({ recentlyViewed: { $not: { $size: 0 } } });
    } else {
        // Default to targeting users who have pushToken or opt for general broad audience 
        // (Limit to 100 for safety unless further specified)
        users = await User.find({ role: "user" }).limit(100);
    }

    let count = 0;

    for (const user of users) {
        try {
            const u = user as any;
            if (!u.pushToken && !u.email && !u.phone) continue;

            // 1. Push
            if (channels.includes("push") && u.pushToken && payload.pushTitle && payload.pushBody) {
                await sendPushNotification({
                    to: u.pushToken,
                    title: payload.pushTitle,
                    body: payload.pushBody
                });
            }

            // 2. WhatsApp
            if (channels.includes("whatsapp") && settings?.whatsappSupportEnabled && settings?.whatsappToken && settings?.whatsappPhoneNumberId && u.phone && payload.whatsappText) {
                try {
                    let phoneNumber = u.phone;
                    if (!phoneNumber.startsWith("+")) phoneNumber = `91${phoneNumber}`;
                    else phoneNumber = phoneNumber.replace("+", "");
                    await sendWhatsAppMessage(phoneNumber, payload.whatsappText, settings.whatsappToken, settings.whatsappPhoneNumberId);
                } catch (e) {
                    console.warn(`Failed WA for ${u.phone}`);
                }
            }

            // 3. Email
            if (channels.includes("email") && u.email && payload.emailSubject && payload.emailHtml) {
                try {
                    await emailService.sendEmail({
                        email: u.email,
                        subject: payload.emailSubject,
                        message: payload.pushBody || "Campaign Offer",
                        html: payload.emailHtml
                    });
                } catch (e) {
                    console.warn(`Failed Email for ${u.email}`);
                }
            }

            count++;
        } catch (iterError) {
            console.error("Broadcast iteration error:", iterError);
        }
    }

    return res.status(200).json({
        status: "success",
        message: `Campaign broadcasted successfully to ${count} users!`
    });
});
