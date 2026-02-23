import express from 'express';
import {
    createCoupon,
    getAllCoupons,
    updateCoupon,
    deleteCoupon,
    assignCouponToUser,
    validateCoupon
} from '../controllers/coupon.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes (or protected for users)
router.post('/validate', validateCoupon);

// Admin routes
router.use(protect);
router.use(restrictTo('admin'));

router.route('/')
    .post(createCoupon)
    .get(getAllCoupons);

router.route('/assign')
    .post(assignCouponToUser);

router.route('/:id')
    .put(updateCoupon)
    .delete(deleteCoupon);

export default router;
