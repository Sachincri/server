import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportRequest extends Document {
    user: mongoose.Types.ObjectId;
    subject: string;
    category: 'Order Issues' | 'Payment Issues' | 'Account & Login' | 'General Queries';
    description: string;
    status: 'Pending' | 'In Progress' | 'Resolved' | 'Closed';
    priority: 'Low' | 'Medium' | 'High' | 'Urgent';
    attachments?: string[];
    createdAt: Date;
    updatedAt: Date;
}

const SupportRequestSchema: Schema = new Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        subject: {
            type: String,
            required: [true, 'Please provide a subject for your request'],
            trim: true,
        },
        category: {
            type: String,
            enum: ['Order Issues', 'Payment Issues', 'Account & Login', 'General Queries'],
            required: true,
        },
        description: {
            type: String,
            required: [true, 'Please provide a detailed description'],
        },
        status: {
            type: String,
            enum: ['Pending', 'In Progress', 'Resolved', 'Closed'],
            default: 'Pending',
        },
        priority: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Urgent'],
            default: 'Medium',
        },
        attachments: [String],
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<ISupportRequest>('SupportRequest', SupportRequestSchema);
