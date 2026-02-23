import { GoogleGenerativeAI } from "@google/generative-ai";
import ApiError from "../utils/apiError";

class AiService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("AI configuration missing: GEMINI_API_KEY is not set.");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || "");
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: "You are a helpful e-commerce shopping assistant for our premium store. You help users with product questions, order status, and recommendations. Keep responses professional, helpful, and concise."
        });
    }

    /**
     * Analyzes a product image and name to generate structured metadata,
     * including SEO fields, descriptions, and specifications.
     */
    async generateProductDetails(imageBuffer: Buffer, mimeType: string, productName: string, additionalContext?: string) {
        if (!process.env.GEMINI_API_KEY) {
            throw ApiError.internal("AI service is not configured on this server.");
        }

        try {
            const prompt = `
        As an e-commerce specialist, analyze the provided image for the product: "${productName}".
        ${additionalContext ? `Context: ${additionalContext}` : ""}
        
        Generate a detailed product listing in valid JSON:
        1. name (professional title, max 80 chars)
        2. description (HTML formatted, engaging, 2-3 paragraphs)
        3. highlights (4-6 key selling points)
        4. specifications (Array of objects, each with 'title' (e.g., General, Performance) and 'items' (Array of key-value pairs))
        5. suggestedOffers (Array of strings. ONLY include offers explicitly mentioned in the provided Context. If no offers are provided in Context, leave this array empty).
        6. seoTitle (max 60 chars)
        7. seoDescription (max 160 chars)
        8. seoKeywords (JSON array of strings, relevant search terms)
        9. suggestedCategory
        10. suggestedPrice (estimated in INR)
        
        Return ONLY the JSON object.
      `;

            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString("base64"),
                    mimeType,
                },
            };

            const result = await this.model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from potential markdown blocks
            const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();

            let productData;
            try {
                productData = JSON.parse(jsonStr);
            } catch (e) {
                console.error("Failed to parse AI-generated JSON response.");
                throw new Error("Received invalid data format from the AI service.");
            }

            // Structure SEO fields into a nested object
            if (productData) {
                let rawKeywords = productData.seoKeywords || [];
                if (typeof rawKeywords === 'string') {
                    rawKeywords = rawKeywords.split(',').map((k: string) => k.trim()).filter(Boolean);
                } else if (!Array.isArray(rawKeywords)) {
                    rawKeywords = [];
                }

                productData.seo = {
                    title: productData.seoTitle?.substring(0, 60),
                    description: productData.seoDescription?.substring(0, 160),
                    keywords: rawKeywords
                };

                delete productData.seoTitle;
                delete productData.seoDescription;
                delete productData.seoKeywords;
            }

            return productData;
        } catch (error: any) {
            console.error("Product Detail Generation Error:", error.message);
            throw ApiError.internal("Could not generate product details at this time.");
        }
    }

    /**
     * Handles AI chat interactions with users.
     */
    async chat(message: string, history: any[] = [], customSystemInstruction?: string) {
        if (!process.env.GEMINI_API_KEY) {
            throw ApiError.internal("AI service is not configured on this server.");
        }

        try {
            // Use custom instruction if provided, otherwise default
            const chatModel = customSystemInstruction
                ? this.genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: customSystemInstruction })
                : this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Robust history validation
            const validatedHistory = history.map((msg: any) => {
                const role = (msg.role === "user") ? "user" : "model";
                // Handle both raw content format and structured parts format
                const parts = msg.parts || [{ text: msg.content || "" }];
                return { role, parts };
            });

            // Find the index of the first 'user' message
            const firstUserIndex = validatedHistory.findIndex(msg => msg.role === "user");
            const finalHistory = firstUserIndex !== -1 ? validatedHistory.slice(firstUserIndex) : [];

            const chat = chatModel.startChat({
                history: finalHistory,
                generationConfig: {
                    maxOutputTokens: 1000,
                },
            });

            const result = await chat.sendMessage(message);
            const response = await result.response;
            let text = response.text();

            // Sanitize output to remove unwanted markers
            text = text.replace(/\*\* response well formated \*\*/gi, "").trim();

            return text;
        } catch (error: any) {
            console.error("AI Chat Error:", error.message);
            throw ApiError.internal("Could not process chat message at this time.");
        }
    }

    /**
     * Generates product suggestions based on context, available products, and user history.
     */
    async getProductSuggestions(currentProduct: any, availableProducts: any[], userContext?: { searchQuery?: string, filters?: any, recentlyViewed?: any[], rating?: number, discount?: number, brand?: string }) {
        if (!process.env.GEMINI_API_KEY) {
            throw ApiError.internal("AI service is not configured on this server.");
        }

        try {
            const productContext = availableProducts.map(p => ({
                id: p._id,
                name: p.name,
                category: p.category?.name || p.category,
                price: p.price,
                description: p.description?.substring(0, 100)
            }));

            let userContextString = "";
            if (userContext) {
                if (userContext.searchQuery) userContextString += `\n        User's Recent Search Query: "${userContext.searchQuery}"`;
                if (userContext.filters && Object.keys(userContext.filters).length > 0) userContextString += `\n        Active Filters: ${JSON.stringify(userContext.filters)}`;
                if (userContext.recentlyViewed && userContext.recentlyViewed.length > 0) {
                    const recentNames = userContext.recentlyViewed.map((p: any) => p.name).join(", ");
                    userContextString += `\n        Recently Viewed Products: ${recentNames}`;
                }
                if (userContext.rating) userContextString += `\n        Preferred Minimum Rating: ${userContext.rating} Stars`;
                if (userContext.discount) userContextString += `\n        Looking for minimum discount of: ${userContext.discount}%`;
                if (userContext.brand) userContextString += `\n        Preferred Brand: ${userContext.brand}`;
            }

            const prompt = `
        Based on the current product being viewed:
        Name: ${currentProduct.name}
        Category: ${currentProduct.category?.name || currentProduct.category}
        Description: ${currentProduct.description}
        ${userContextString ? `\n        User Context (Highly Important for Relevance):${userContextString}` : ""}

        And these available products:
        ${JSON.stringify(productContext)}

        Suggest 4 products from the available products that the user might also like. 
        Take into account the User Context (search query, filters, recently viewed) if provided, to make highly relevant suggestions.
        Provide a brief reason for each suggestion.
        Return ONLY a JSON array of objects with 'productId' and 'reason' fields.
      `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(jsonStr);
        } catch (error: any) {
            console.error("Product Suggestion Error:", error.message);
            return []; // Fallback to empty if AI fails
        }
    }
}

export const aiService = new AiService();
