import express from 'express';
import * as orderController from '../controllers/order.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';

const router = express.Router();

router.use(protect);

import { validateOrderPrice } from '../middleware/validateOrderPrice.middleware';

// ...

router.post('/',

  validate,
  validateOrderPrice,
  orderController.createOrder
);


router.get('/me', orderController.myOrders);
router.get('/stats', restrictTo('admin'), orderController.getOrderStats); // Added stats route as well just in case
router.get('/', orderController.getAllOrders);

router.get('/:id', orderController.getSingleOrder);

router.patch('/:id/status',
  restrictTo('admin'),
  [body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])],
  validate,
  orderController.updateOrderStatus
);

router.post('/:id/email', restrictTo('admin'), orderController.sendOrderEmail);
router.put('/:id/cancel', orderController.cancelOrder);
router.delete('/:id', restrictTo('admin'), orderController.deleteOrder);

export default router;