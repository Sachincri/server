import mongoose, { Schema, Document } from "mongoose";

export interface IMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

export interface IWhatsAppSession extends Document {
    phoneNumber: string;
    history: IMessage[];
    createdAt: Date;
    updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
    role: { type: String, enum: ["user", "model"], required: true },
    parts: [{ text: { type: String, required: true } }]
}, { _id: false });

const whatsAppSessionSchema = new Schema<IWhatsAppSession>({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    history: {
        type: [messageSchema],
        default: []
    }
}, {
    timestamps: true
});

// Create a TTL index so old sessions expire and free up DB space (e.g. 7 days inactive)
// Note: You can customize the expiry or remove it if you want unlimited persistent history.
whatsAppSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 604800 }); 

export default mongoose.model<IWhatsAppSession>("WhatsAppSession", whatsAppSessionSchema);
