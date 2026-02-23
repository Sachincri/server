import express from 'express';
import * as addressController from '../controllers/address.controller';
import { protect } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';

const router = express.Router();

router.use(protect);

router.post('/',
    [
        body('name').notEmpty().withMessage('Name is required'),
        body('address').notEmpty().withMessage('Address is required'),
        body('city').notEmpty().withMessage('City is required'),
        body('state').notEmpty().withMessage('State is required'),
        body('country').notEmpty().withMessage('Country is required'),
        body('pinCode').isNumeric().withMessage('Pin code must be numeric'),
        body('phoneNo').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required')
    ],
    validate,
    addressController.addAddress
);

router.get('/', addressController.getAddresses);

router.put('/:id',
    [
        body('name').optional().notEmpty(),
        body('address').optional().notEmpty(),
        body('city').optional().notEmpty(),
        body('state').optional().notEmpty(),
        body('country').optional().notEmpty(),
        body('pinCode').optional().isNumeric(),
        body('phoneNo').optional().matches(/^[0-9]{10}$/)
    ],
    validate,
    addressController.updateAddress
);

router.delete('/:id', addressController.deleteAddress);

router.patch('/:id/default', addressController.setDefaultAddress);

export default router;
