import mongoose, { Document, Schema } from 'mongoose';

export interface ICartItem {
    product: mongoose.Types.ObjectId;
    productName: string;
    productImage: string;
    quantity: number; sellingPrice: number;
    maximumRetailPrice?: number;
    discount?: number;
    finalPrice: number;
    variant?: {
        size?: string;
        color?: string;
        [key: string]: any;
    };
    stock: number;
}

export interface ICart extends Document {
    user: mongoose.Types.ObjectId;
    items: ICartItem[];
    subtotal: number;
    totalDiscount: number;
    total: number;
    itemCount: number;
    couponCode?: string;
    isCoinsRedeemed: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    productImage: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity cannot be less than 1'],
        default: 1
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: [0, 'Selling Price cannot be negative']
    },
    maximumRetailPrice: {
        type: Number,
        min: [0, 'Maximum Retail Price cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
    },
    finalPrice: {
        type: Number,
        required: true,
        min: [0, 'Final price cannot be negative']
    },
    variant: {
        type: Schema.Types.Mixed,
        default: null
    },
    stock: {
        type: Number,
        required: true,
        min: [0, 'Stock cannot be negative']
    }
});

const CartSchema = new Schema<ICart>({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [CartItemSchema],
    subtotal: {
        type: Number,
        default: 0
    },
    couponCode: {
        type: String,
        default: null
    },
    isCoinsRedeemed: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Virtual subtotal (can replace storing it if preferred, or used for validation)
CartSchema.virtual('totalItems').get(function () {
    return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Middleware to calculate subtotal before saving
CartSchema.pre('save', function (next) {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
    this.totalDiscount = this.items.reduce((sum, item) => sum + ((item.discount || 0) * item.quantity), 0);
    this.total = this.items.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    this.itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);
    next();
});

CartSchema.index({ user: 1 });

export const Cart = mongoose.model<ICart>('Cart', CartSchema);

