import express from "express";
import { verifyWebhook, handleMessage } from "../controllers/whatsapp.controller";

const router = express.Router();

// Meta required webhook endpoints
router.get("/webhook", verifyWebhook);
router.post("/webhook", handleMessage);

export default router;
