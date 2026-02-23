import express from "express";
import { generateProductDetails, bufferUpload, chat, getProductSuggestions } from "../controllers/ai.controller";
import { protect, restrictTo, optionalProtect } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.post("/suggestions/:productId", getProductSuggestions);
router.post("/chat", optionalProtect, chat);

// Admin/Seller routes
router.post("/generate-details", protect, restrictTo("seller", "admin"), bufferUpload.single("image"), generateProductDetails);

export default router;
