import express from "express";
import { getMyNotifications, markAsRead, markAllAsRead } from "../controllers/notification.controller";
import { protect } from "../middleware/auth.middleware";

const router = express.Router();

router.use(protect);

router.get("/", getMyNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);

export default router;
