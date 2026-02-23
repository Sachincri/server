import { Schema, model, Document, Types } from "mongoose";

export interface ICategoryImage {
  public_id: string;
  url: string;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: ICategoryImage;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  parent?: Types.ObjectId | ICategory; // Reference to parent category for nested structure
  level: number; // 0 for root categories, 1 for first-level subcategories, etc.
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    level: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

categorySchema.index({ parent: 1 });

export const Category = model<ICategory>("Category", categorySchema);

