import mongoose, { Schema, Document } from "mongoose";

export interface IWishlist extends Document {
    user: mongoose.Schema.Types.ObjectId;
    products: mongoose.Schema.Types.ObjectId[];
}

const wishlistSchema = new Schema<IWishlist>(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        products: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
            },
        ],
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<IWishlist>("Wishlist", wishlistSchema);
