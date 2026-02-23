import { Router } from "express";
import {
    addToCart,
    getCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    syncCart,
    getCartSummary,
    applyCouponToCart,
    removeCouponFromCart,
    toggleCartCoins,
} from "../controllers/cart.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

// Apply authentication middleware to all cart routes
router.use(protect);

router
    .route("/")
    .get(getCart)
    .post(addToCart)
    .delete(clearCart);

router.get("/summary", getCartSummary);
router.post("/sync", syncCart);

router.post("/coupon", applyCouponToCart);
router.delete("/coupon", removeCouponFromCart);
router.post("/coins", toggleCartCoins);

router
    .route("/:itemId")
    .patch(updateCartItem)
    .delete(removeFromCart);

export default router;
