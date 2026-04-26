// file: routes/payment.routes.ts
import express from 'express';
import { body, param } from 'express-validator';
import * as paymentController from '../controllers/payment.controller';
import * as stripeController from '../controllers/stripe.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = express.Router();

/**
 * Webhook endpoint (Razorpay posts here) — public (no protect)
 * POST /api/payment/webhook
 */
router.post('/webhook', paymentController.handlePaymentWebhook);

router.use(protect);

/**
 * Create Razorpay order
 * POST /api/payment/order
 */
import { validateOrderPrice } from '../middleware/validateOrderPrice.middleware';

// ...

router.post(
  '/order',
  [
    body('amount').optional(), // We ignore amount anyway
    body('currency').optional().isString().withMessage('currency must be a string'),
    body('notes').optional().isObject().withMessage('notes must be an object'),
  ],
  validate,
  validateOrderPrice,
  paymentController.createRazorpayOrder
);

/**
 * Verify payment and create order
 * POST /api/payment/verify
 */
router.post(
  '/verify',
  validate,
  validateOrderPrice,
  paymentController.paymentVerification
);

/**
 * Get Razorpay key (public)
 * GET /api/payment/key
 */
router.get('/key', paymentController.getRazorpayKey);

/**
 * Create Stripe Payment Intent
 * POST /api/payment/stripe/create-intent
 */
router.post(
  '/stripe/create-intent',
  validateOrderPrice,
  stripeController.createStripePaymentIntent
);

/**
 * Verify Stripe Payment
 * POST /api/payment/stripe/verify
 */
router.post(
  '/stripe/verify',
  [
    body('paymentIntentId').exists().withMessage('paymentIntentId is required'),
  ],
  validate,
  validateOrderPrice,
  stripeController.verifyStripePayment
);

/**
 * Get payment details
 * GET /api/payment/:id
 */
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid payment id')],
  validate,
  paymentController.getPaymentDetails
);



/**
 * Admin routes
 */

/**
 * Refund payment
 * POST /api/admin/payment/refund
 * body: { paymentId: string, amount?: number, reason?: string }
 */
router.post(
  '/admin/payment/refund',
  protect,
  restrictTo('admin'),
  [
    body('paymentId').exists().withMessage('paymentId is required').isMongoId(),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('amount must be a number > 0'),
    body('reason').optional().isString(),
  ],
  validate,
  paymentController.refundPayment
);

/**
 * Payment stats (admin)
 * GET /api/admin/payment/stats
 */
router.get(
  '/admin/payment/stats',
  protect,
  restrictTo('admin'),
  paymentController.getPaymentStats
);

export default router;
