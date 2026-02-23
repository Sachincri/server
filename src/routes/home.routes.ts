import express from "express";
import * as homeController from "../controllers/home.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { createCategory, getCategories } from "../controllers/category.controller";
import { createBrand, getBrands } from "../controllers/brand.controller";
import * as settingsController from "../controllers/settings.controller";
import upload from "../middleware/upload.middleware";
// import { body } from 'express-validator';
// import { validate } from '../middleware/validate.middleware';

const router = express.Router();
router.get('/brand', getBrands);
router.get('/getcategories', getCategories);
router.get("/settings", settingsController.getPublicSettings);
router.get("/", homeController.getActiveHomePage);
router.use(protect);
router.use(restrictTo("seller", "admin"));
router.post('/addcategories', upload.single('image'), createCategory);

router.post('/addbrand', upload.single("logo"), createBrand);
router.put("/cms/home", upload.any(), homeController.createHomePage);
router.post("/updateHomePage", upload.any(), homeController.updateHomePage);
router.delete("/deleteBanner/:id", homeController.deleteHomePage);
router.patch("/updateBanner/:id", homeController.toggleHomePageStatus);

// Modular Routes
router.patch("/home/:id/seo", upload.any(), homeController.updateSEO);
router.patch("/home/:id/carousel", upload.any(), homeController.updateCarousel);
router.patch("/home/:id/header", upload.any(), homeController.updateHeader);
router.post("/home/:id/sections", upload.any(), homeController.addSection);
router.patch("/home/:id/sections/:sectionId", upload.any(), homeController.updateSection);
router.delete("/home/:id/sections/:sectionId", homeController.removeSection);
router.patch("/home/:id/reorder-sections", homeController.reorderSections);

export default router;
