import mongoose, { Schema } from "mongoose";
import { IProduct } from "../types/productTypes";


const productSchema = new Schema<IProduct>(
    {
        slug: {
            type: String,
            required: true,
            trim: true,
        },
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true,
            maxlength: [100, "Product name cannot exceed 100 characters"],
        },
        description: {
            type: String,
            required: [true, "Product description is required"],
            maxlength: [2000, "Description cannot exceed 2000 characters"],
        },
        maximumRetailPrice: {
            type: Number,
            required: [true, "Maximum Retail Price is required"],
            min: [0, "Maximum Retail Price cannot be negative"],
        },
        sellingPrice: {
            type: Number,
            required: [true, "Selling price is required"],
            min: [0, "Selling price cannot be negative"],
        },
        actualPrice: {
            type: Number,
            required: false,
            min: [0, "Actual price cannot be negative"],
        },
        discount: {
            type: Number,
            default: 0,
            min: [0, "Discount cannot be negative"],
            max: [100, "Discount cannot exceed 100%"],
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },

        subCategory: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },
        brand: {
            type: Schema.Types.ObjectId,
            ref: "Brand",
            default: null,
        },
        weight: {
            type: Number,
            default: 0.5, // 0.5kg default
        },
        stock: {
            type: Number,
            required: [true, "Product stock is required"],
            min: [0, "Stock cannot be negative"],
            default: 0,
        },
        images: [
            {
                public_id: { type: String, required: true },
                url: { type: String, required: true },
            },
        ],
        thumbnail: {
            public_id: { type: String, required: false },
            url: { type: String, required: false },
        },
        videos: [
            {
                public_id: { type: String, required: true },
                url: { type: String, required: true },
            },
        ],
        seller: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        ratings: {
            average: {
                type: Number,
                default: 0,
                min: [0, "Rating must be at least 0"],
                max: [5, "Rating must not exceed 5"],
            },
            count: {
                type: Number,
                default: 0,
            },
        },
        reviews: [
            {
                user: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                name: {
                    type: String,
                    required: true,
                },
                rating: {
                    type: Number,
                    required: true,
                    min: 1,
                    max: 5,
                },
                comment: {
                    type: String,
                    required: true,
                },
                images: [
                    {
                        public_id: { type: String, required: true },
                        url: { type: String, required: true },
                    },
                ],
                videos: [
                    {
                        public_id: { type: String, required: true },
                        url: { type: String, required: true },
                    },
                ],
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        offers: {
            type: [String],
            default: [],
        },
        highlights: {
            type: [String],
            default: [],
        },
        colors: [
            {
                name: { type: String, required: true },
                image: { type: String, default: "" }, // URL for the color variant image
            },
        ],
        sizes: {
            type: [String],
            default: [],
        },
        specifications: [
            {
                title: { type: String, required: true },
                items: [
                    {
                        key: { type: String, required: true },
                        value: { type: String, required: true },
                    },
                ],
            },
        ],
        warranty: {
            type: String,
            default: "",
            trim: true,
        },

        seo: {
            title: {
                type: String,
                trim: true,
                maxlength: [60, "SEO Title cannot exceed 60 characters"],
            },
            description: {
                type: String,
                trim: true,
                maxlength: [160, "SEO Description cannot exceed 160 characters"],
            },
            keywords: {
                type: [String],
                default: [],
            },
        },
        homeDisplaySection: {
            type: String,
            default: "",
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ✅ Compound indexes — isActive first (highest cardinality filter for ~40-70% faster queries)
productSchema.index({ isActive: 1, category: 1, sellingPrice: 1 });   // category + price filter
productSchema.index({ isActive: 1, brand: 1, sellingPrice: 1 });      // brand + price filter  
productSchema.index({ isActive: 1, createdAt: -1 });                   // default sort
productSchema.index({ isActive: 1, "ratings.average": -1 });          // sort by rating
productSchema.index({ isActive: 1, discount: -1 });                   // sort by discount

// ✅ Specialized indexes
productSchema.index({ name: "text", description: "text" });            // text search (Fix 1)
productSchema.index({ slug: 1 }, { unique: true });                    // slug lookup
productSchema.index({ seller: 1 });                                    // seller dashboard
productSchema.index({ homeDisplaySection: 1 });                        // home page sections

// Slug collision handling
productSchema.pre<IProduct>("save", async function (next) {
    if (!this.isModified("name") && !this.isNew) return next();

    let generatedSlug = this.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");

    const slugRegExp = new RegExp(`^${generatedSlug}(-[0-9]*)?$`, "i");
    const productsWithSimilarSlug = await this.model("Product").find({ slug: slugRegExp });

    if (productsWithSimilarSlug.length > 0) {
        generatedSlug = `${generatedSlug}-${productsWithSimilarSlug.length + 1}`;
    }

    this.slug = generatedSlug;
    next();
});


export default mongoose.model<IProduct>("Product", productSchema);
