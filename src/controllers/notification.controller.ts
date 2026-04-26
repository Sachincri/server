import { Response, NextFunction } from "express";
import Notification from "../models/Notification.model";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import User from "../models/User.model";
import { sendPushNotification } from "../utils/notification";
import logger from "../utils/logger";

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



/**
 * Helper to create notification in DB AND send push notification
 * This is the central function for all user-facing notifications.
 */
export const createNotification = async (
    recipientId: string,
    type: string,
    title: string,
    message: string,
    data?: any
) => {
    try {
        // 1. Save in-app notification to DB
        await Notification.create({
            recipient: recipientId,
            type,
            title,
            message,
            data,
        });

        // 2. Send push notification (non-blocking — don't let push failure affect the flow)
        try {
            const user = await User.findById(recipientId).select("pushToken").lean();
            if (user?.pushToken) {
                // Build push data payload for deep linking on the mobile app
                const pushData: any = { ...(data || {}) };

                // Auto-detect screen for order notifications
                if (type === "order_status" && data?.orderId) {
                    pushData.screen = "OrderDetail";
                    pushData.orderId = String(data.orderId);
                } else if (type === "promotional") {
                    pushData.screen = "Orders";
                } else if (type === "stock_alert" && data?.productId) {
                    pushData.screen = "Product";
                    pushData.productId = String(data.productId);
                } else if (type === "refund_update" && data?.orderId) {
                    pushData.screen = "OrderDetail";
                    pushData.orderId = String(data.orderId);
                }

                await sendPushNotification({
                    to: user.pushToken,
                    title,
                    body: message,
                    data: pushData,
                });
            }
        } catch (pushError) {
            // Log but don't throw — push is best-effort
            logger.error("Push notification delivery failed:", pushError);
        }
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};

/**
 * Notify all admins — DB notification + push to all admin devices
 */
export const notifyAdmins = async (
    type: string,
    title: string,
    message: string,
    data?: any
) => {
    try {
        const admins = await User.find({ role: "admin" }).select("_id pushToken");
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

        // Send push to all admins who have a push token
        const adminTokens = admins
            .filter((a) => a.pushToken)
            .map((a) => a.pushToken as string);

        if (adminTokens.length > 0) {
            try {
                await sendPushNotification({
                    to: adminTokens,
                    title,
                    body: message,
                    data: { ...(data || {}), screen: "AdminDashboard" },
                });
            } catch (pushError) {
                logger.error("Admin push notification failed:", pushError);
            }
        }
    } catch (error) {
        console.error("Failed to notify admins:", error);
    }
};
