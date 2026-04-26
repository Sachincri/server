import express from "express";
import { generateProductDetails, bufferUpload, chat, getProductSuggestions, initiateCall, getOrderStatusTool, processActionTool, getPoliciesTool, handleInboundCall } from "../controllers/ai.controller";
import { protect, restrictTo, optionalProtect, verifyBlandWebhook } from "../middleware/auth.middleware";
import { aiLimiter } from "../middleware/rateLimiter.middleware";

const router = express.Router();

// Public routes
router.post("/suggestions/:productId", aiLimiter, getProductSuggestions);
router.post("/chat", aiLimiter, optionalProtect, chat);
router.post("/call", aiLimiter, protect, restrictTo("admin"), initiateCall);
router.post("/inbound-call", verifyBlandWebhook, handleInboundCall);

// AI Agent Custom Tools (Internal Webhooks)
router.post("/tools/order-status", verifyBlandWebhook, getOrderStatusTool);
router.post("/tools/process-action", verifyBlandWebhook, processActionTool);
router.post("/tools/policies", verifyBlandWebhook, getPoliciesTool);

// Admin/Seller routes
router.post("/generate-details", protect, restrictTo("seller", "admin"), bufferUpload.single("image"), generateProductDetails);

export default router;
