import express from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';

const router = express.Router();

router.use(protect);

router.patch('/profile',
  [
    body('name').optional().trim().isLength({ min: 2, max: 50 }),
    body('phone').optional().matches(/^[0-9]{10}$/)
  ],
  validate,
  userController.updateProfile
);

router.patch('/password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  ],
  validate,
  userController.updatePassword
);


router.get('/coins', userController.getMyCoinHistory);
router.get('/reviews', userController.getMyReviews);



router.delete('/account', userController.deleteAccount);

export default router;