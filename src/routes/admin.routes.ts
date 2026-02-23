import express from "express";
import {
  getAdminDashboard,
  getProductAnalytics,
  getCustomerAnalytics,
  getAllUsers,
  getUserDetails,
  updateUserRole,
  deleteUser,
} from "../controllers/admin.controller";
// import { getGoogleAnalyticsReport } from "../controllers/analytics.controller"; // Added import
import { getSettings, updateSettings } from "../controllers/settings.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { getAdminProducts } from "../controllers/product.controller";
import { getAllOrders, getOrderStats, updateOrderStatus, deleteOrder } from "../controllers/order.controller";


const router = express.Router();

router.use(protect);
router.use(restrictTo("seller", "admin"));

router.get("/product/details", getAdminProducts)
router.get("/dashboard", getAdminDashboard);
router.get("/analytics/products", getProductAnalytics);
router.get("/analytics/customers", getCustomerAnalytics);
// router.get("/analytics/google", getGoogleAnalyticsReport); // Added Route
router.get("/orders", getAllOrders)
router.get("/order/status", getOrderStats)

// User management
router.get("/users", getAllUsers);
router.get("/user/:id", getUserDetails);
router.put("/user/:id", updateUserRole);
router.delete("/user/:id", deleteUser);

// Settings management
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

// Order management
router.put("/order/:id", updateOrderStatus);
router.delete("/order/:id", deleteOrder);

export default router;

