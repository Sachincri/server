import { Response, NextFunction } from "express";
import Notification from "../models/Notification.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import User from "../models/User.model";

/**
 * Get my notifications
 * GET /api/notifications
 */
export const getMyNotifications = asyncHandler(
    async (req: any, res: Response, _next: NextFunction) => {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort("-createdAt")
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            read: false,
        });

        res.status(200).json({
            status: "success",
            data: {
                notifications,
                unreadCount,
            },
        });
    }
);

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
export const markAsRead = asyncHandler(
    async (req: any, res: Response, _next: NextFunction) => {
        const notification = await Notification.findOne({
            _id: req.params.id,
            recipient: req.user._id,
        });

        if (!notification) {
            throw ApiError.notFound("Notification not found");
        }

        notification.read = true;
        await notification.save();

        res.status(200).json({
            status: "success",
            message: "Marked as read",
        });
    }
);

/**
 * Mark all as read
 * PATCH /api/notifications/read-all
 */
export const markAllAsRead = asyncHandler(
    async (req: any, res: Response, _next: NextFunction) => {
        await Notification.updateMany(
            { recipient: req.user._id, read: false },
            { read: true }
        );

        res.status(200).json({
            status: "success",
            message: "All notifications marked as read",
        });
    }
);

// Helper to create notification internally
export const createNotification = async (
    recipientId: string,
    type: string,
    title: string,
    message: string,
    data?: any
) => {
    try {
        await Notification.create({
            recipient: recipientId,
            type,
            title,
            message,
            data,
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};

export const notifyAdmins = async (
    type: string,
    title: string,
    message: string,
    data?: any
) => {
    try {
        const admins = await User.find({ role: "admin" }).select("_id");
        const notifications = admins.map((admin) => ({
            recipient: admin._id,
            type,
            title,
            message,
            data,
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
    } catch (error) {
        console.error("Failed to notify admins:", error);
    }
};
