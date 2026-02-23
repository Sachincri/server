import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
    recipient: mongoose.Types.ObjectId;
    type: 'order_status' | 'stock_alert' | 'system_alert' | 'promotional';
    title: string;
    message: string;
    read: boolean;
    data?: any;
    createdAt: Date;
}

const NotificationSchema: Schema = new Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        type: {
            type: String,
            enum: ['order_status', 'stock_alert', 'system_alert', 'promotional', 'refund_update'],
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        read: {
            type: Boolean,
            default: false,
        },
        data: {
            type: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<INotification>('Notification', NotificationSchema);
