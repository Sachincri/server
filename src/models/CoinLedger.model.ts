import mongoose, { Document, Schema } from 'mongoose';

export interface ICoinLedger extends Document {
    user: mongoose.Types.ObjectId;
    amount: number;
    type: 'earn' | 'redeem' | 'expire' | 'admin';
    order?: mongoose.Types.ObjectId;
    description: string;
    expiresAt?: Date;
    isExpired: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const coinLedgerSchema = new Schema<ICoinLedger>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        type: {
            type: String,
            enum: ['earn', 'redeem', 'expire', 'admin'],
            required: true,
        },
        order: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
        },
        description: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            index: true,
        },
        isExpired: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<ICoinLedger>('CoinLedger', coinLedgerSchema);
