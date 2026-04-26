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
router.use(restrictTo("admin"));
router.post('/addcategories', upload.single('image'), createCategory);

router.post('/addbrand', upload.single("logo"), createBrand);
router.put("/cms/home", upload.any(), homeController.createHomePage);
router.post("/updateHomePage", upload.any(), homeController.updateHomePage);
router.delete("/deleteBanner/:id", homeController.deleteHomePage);
router.patch("/updateBanner/:id", homeController.toggleHomePageStatus);

// New Home Pages Manager Routes
router.get("/cms/pages", homeController.getAllHomePages);
router.get("/cms/pages/:id", homeController.getHomePageById);
router.patch("/cms/pages/:id/status", homeController.toggleHomePageStatus);
router.post("/cms/pages", upload.any(), homeController.createHomePage);
router.put("/cms/pages/:id", upload.any(), homeController.updateHomePage);
router.delete("/cms/pages/:id", homeController.deleteHomePage);

// Modular Routes
router.patch("/home/:id/seo", upload.any(), homeController.updateSEO);
router.patch("/home/:id/carousel", upload.any(), homeController.updateCarousel);
router.patch("/home/:id/header", upload.any(), homeController.updateHeader);
router.post("/home/:id/sections", upload.any(), homeController.addSection);
router.patch("/home/:id/sections/:sectionId", upload.any(), homeController.updateSection);
router.delete("/home/:id/sections/:sectionId", homeController.removeSection);
router.patch("/home/:id/reorder-sections", homeController.reorderSections);

// Manual Selection Routes
router.get("/cms/sections/metadata", homeController.getHomeSectionsMetadata);
router.post("/cms/sections/add-product", homeController.addProductToHomeSection);
router.post("/cms/resolve-oembed", homeController.resolveOEmbed);

export default router;
