import express from "express";
import { generateCampaignDetails, broadcastGeneratedCampaign } from "../controllers/campaign.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";

const router = express.Router();

// Only Admins can access campaign generation tools
router.use(protect, restrictTo("admin"));

router.post("/generate", generateCampaignDetails);
router.post("/broadcast", broadcastGeneratedCampaign);

export default router;
