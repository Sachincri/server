import express from 'express';
import {
    submitRequest,
    getMyRequests,
    getAllRequests,
    updateRequestStatus,
} from '../controllers/support.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { contactLimiter } from '../middleware/rateLimiter.middleware';


const router = express.Router();

// Apply protection to all routes
router.use(protect);

router.post('/request', contactLimiter, submitRequest);

router.get('/my-requests', getMyRequests);

// Admin-only routes
router.use(restrictTo('admin'));
router.get('/all-requests', getAllRequests);
router.patch('/:id', updateRequestStatus);

export default router;
