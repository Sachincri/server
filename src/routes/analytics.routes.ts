import express from "express";
import { getRealtimeTraffic } from "../controllers/analytics.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";

const router = express.Router();
router.use(protect);
router.get("/realtime", restrictTo("admin"), getRealtimeTraffic);

export default router;
