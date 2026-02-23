import express from 'express';
import * as productController from '../controllers/product.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
// import { body } from 'express-validator';
// import { validate } from '../middleware/validate.middleware';
import upload from '../middleware/upload.middleware';
import { searchLimiter } from '../middleware/rateLimiter.middleware';


const router = express.Router();



router.get('/', searchLimiter, productController.getAllProducts);

router.get('/getRecentlyViewedProduct', protect, productController.getRecentlyViewedProducts);
router.get('/reviews', productController.getProductReviews);
router.get('/reviews/me', protect, productController.getUserReviews);
router.get('/:id', productController.getProductDetails);

router.use(protect);
router.put('/recentlyviewed', productController.addToRecentlyViewed);

// Review routes (accessible to all authenticated users)
router.put('/review', productController.createProductReview);
router.delete('/review', productController.deleteReview);

router.use(restrictTo('seller', 'admin'));

router.post('/addnewproduct',
  // [
  //   body('name').trim().notEmpty().isLength({ max: 100 }),
  //   body('description').trim().notEmpty().isLength({ max: 2000 }),
  //   body('price').isFloat({ min: 1 }),
  //   body('category'),
  //   body('stock').isInt({ min: 1 })
  // ],

  // validate,
  upload.any(),
  productController.createProduct
);


router.patch('/:id', upload.any(), productController.updateProduct);
router.delete('/:id', productController.deleteProduct);



export default router;