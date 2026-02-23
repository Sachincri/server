import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
    shippingInfo: {
        address: string;
        city: string;
        state: string;
        country: string;
        pinCode: number;
        phoneNo: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    orderItems: {
        name: string;
        sellingPrice: number;
        actualPrice?: number;
        quantity: number;
        image: string;
        product: mongoose.Schema.Types.ObjectId;
        size?: string;
        color?: string;
        status: string; // Item-level status
    }[];
    user: mongoose.Schema.Types.ObjectId;
    paymentInfo: {
        id: string;
        status: string;
        method: string;
    };

    paidAt: Date;
    itemsPrice: number;

    shippingPrice: number;
    totalPrice: number;
    redeemCoins: number;
    orderStatus: string;
    deliveredAt: Date;
    createdAt: Date;
    shippedAt?: Date;
    processingAt?: Date;
    cancelledAt?: Date;
    cancellationReason?: string;
    coinsEarned?: number;
}

const orderSchema = new Schema<IOrder>(
    {
        shippingInfo: {
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            pinCode: { type: Number, required: true },
            phoneNo: { type: String, required: true },
            firstName: { type: String, required: true },
            lastName: { type: String, required: false },
            email: { type: String, required: false },
        },
        orderItems: [
            {
                name: { type: String, required: true },
                sellingPrice: { type: Number, required: true },
                actualPrice: { type: Number },
                quantity: { type: Number, required: true },
                image: { type: String, required: true },
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                size: { type: String },
                color: { type: String },
                status: {
                    type: String,
                    default: "Processing",
                    enum: ["Processing", "Shipped", "Delivered", "Cancelled", "Returned"],
                }
            },
        ],
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        paymentInfo: {
            id: { type: String, required: true },
            status: { type: String, required: true },
            method: { type: String, required: true },
        },
        paidAt: {
            type: Date,
        },
        itemsPrice: {
            type: Number,
            required: true,
            default: 0,
        },

        shippingPrice: {
            type: Number,
            required: true,
            default: 0,
        },
        totalPrice: {
            type: Number,
            required: true,
            default: 0,
        },
        redeemCoins: {
            type: Number,
            default: 0
        },
        orderStatus: {
            type: String,
            required: true,
            default: "Processing",
        },
        deliveredAt: Date,
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

orderSchema.add({
    shippedAt: Date,
    processingAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    coinsEarned: {
        type: Number,
        default: 0
    }
});


orderSchema.index({ user: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ "paymentInfo.id": 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model<IOrder>("Order", orderSchema);

