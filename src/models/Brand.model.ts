import { Schema, model, Document, Types } from "mongoose";

export interface IBrandImage {
  public_id: string;
  url: string;
}

export interface IBrand extends Document {
  name: string;
  slug: string;
  description?: string;
  logo?: IBrandImage;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  categories?: Types.ObjectId[]; // optional: link brand to categories
}

const brandSchema = new Schema<IBrand>(
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
    logo: {
      public_id: { type: String },
      url: { type: String },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    categories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
  },
  { timestamps: true }
);

export const Brand = model<IBrand>("Brand", brandSchema);
