import { Document, Types } from "mongoose";

export interface ImageLink {
    public_id: string;
    url: string;
}

export interface Review {
    _id: string;
    user: Types.ObjectId;
    name: string;
    rating: number;
    comment: string;
    createdAt: Date;
}

export interface IProduct extends Document {
    name: string;
    description: string;
    maximumRetailPrice: number;
    sellingPrice: number;
    actualPrice?: number;
    discount: number;
    category: Types.ObjectId;
    subCategory?: Types.ObjectId;
    brand?: Types.ObjectId;
    stock: number;
    images: ImageLink[];
    thumbnail?: ImageLink;
    seller: Types.ObjectId;
    ratings: {
        average: number;
        count: number;
    };
    reviews: Review[];
    offers: string[];
    highlights: string[];
    colors: {
        _id?: string;
        name: string;
        image?: string;
    }[];
    sizes: string[];
    specifications: {
        _id?: string;
        title: string;
        items: {
            _id?: string;
            key: string;
            value: string;
        }[];
    }[];
    warranty: string;
    seo: {
        title?: string;
        description?: string;
        keywords: string[];
    };
    slug: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProductData {
    name: string;
    description: string;
    maximumRetailPrice: number;
    sellingPrice: number;
    actualPrice: number;
    discount: number;
    category: string;
    subCategory?: string;
    brand?: string;
    stock: number;
    images: ImageLink[];
    thumbnail?: ImageLink;
    seller: string;
    offers: string[];
    highlights: string[];
    colors: {
        name: string;
        image?: string;
    }[];
    sizes: string[];
    specifications: {
        title: string;
        items: {
            key: string;
            value: string;
        }[];
    }[];
    warranty: string;
    seo: {
        title?: string;
        description?: string;
        keywords: string[];
    };
    slug: string;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
