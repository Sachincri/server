import express from "express";
import { getAllBrands } from "../controllers/brand.controller";

const router = express.Router();

router.get("/", getAllBrands);

export default router;
