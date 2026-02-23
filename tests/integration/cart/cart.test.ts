import request from 'supertest';
import app from '../../../src/app';
import Product from '../../../src/models/Product.model';
import User, { IUser } from '../../../src/models/User.model';
import { Cart } from '../../../src/models/Cart.model';
import { Category } from '../../../src/models/Category.model';
import { generateMockUser, generateMockProduct, generateAuthToken, hashPassword } from '../../helpers/testHelpers';

describe('Cart - Add to Cart', () => {
    let userToken: string;
    let userId: string;
    let product: any;
    let category: any;

    beforeEach(async () => {
        // Create user
        const userData = generateMockUser();
        const user: IUser = await User.create({
            ...userData,
            password: await hashPassword(userData.password),
            isVerified: true,
        });
        userId = user._id.toString();
        userToken = generateAuthToken(userId, 'user');

        // Create category
        category = await Category.create({
            name: 'Electronics',
            slug: 'electronics',
            image: { public_id: 'test', url: 'http://example.com/image.jpg' },
        });

        // Create product
        product = await Product.create(
            generateMockProduct({
                category: category._id,
                stock: 10,
                sellingPrice: 1000,
                discount: 0,
                seller: userId,
                slug: 'test-product-cart',
            })
        );
    });

    describe('POST /api/v1/cart', () => {
        it('should add product to cart successfully', async () => {
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 2,
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('added');
            expect(response.body.data.items).toHaveLength(1);
            expect(response.body.data.items[0].quantity).toBe(2);
        });

        it('should create cart if it does not exist', async () => {
            const cartBefore = await Cart.findOne({ user: userId });
            expect(cartBefore).toBeNull();

            await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                })
                .expect(200);

            const cartAfter = await Cart.findOne({ user: userId });
            expect(cartAfter).toBeTruthy();
            expect(cartAfter?.items).toHaveLength(1);
        });

        it('should increment quantity if product already in cart', async () => {
            // Add product first time
            await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 2,
                });

            // Add same product again
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 3,
                })
                .expect(200);

            expect(response.body.data.items).toHaveLength(1);
            expect(response.body.data.items[0].quantity).toBe(5); // 2 + 3
        });

        it('should return error if product not found', async () => {
            const fakeId = '507f1f77bcf86cd799439011';

            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: fakeId,
                    quantity: 1,
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('not found');
        });

        it('should return error if product is inactive', async () => {
            product.isActive = false;
            await product.save();

            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('not available');
        });

        it('should return error if quantity exceeds stock', async () => {
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 15, // Stock is 10
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('stock');
        });

        it('should return error if quantity is invalid', async () => {
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 0,
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should return error if not authenticated', async () => {
            const response = await request(app)
                .post('/api/v1/cart')
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should store product details in cart item', async () => {
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                })
                .expect(200);

            const cartItem = response.body.data.items[0];
            expect(cartItem.productName).toBe(product.name);
            expect(cartItem.sellingPrice).toBe(product.sellingPrice);
            expect(cartItem.finalPrice).toBe(product.sellingPrice);
        });

        it('should handle variants correctly', async () => {
            const variant = { color: 'Red', size: 'L' };

            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                    variant,
                })
                .expect(200);

            expect(response.body.data.items[0].variant).toEqual(variant);
        });

        it('should treat different variants as separate items', async () => {
            // Add with variant 1
            await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                    variant: { color: 'Red' },
                });

            // Add with variant 2
            const response = await request(app)
                .post('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    productId: product._id.toString(),
                    quantity: 1,
                    variant: { color: 'Blue' },
                })
                .expect(200);

            expect(response.body.data.items).toHaveLength(2);
        });
    });

    describe('GET /api/v1/cart', () => {
        it('should return user cart', async () => {
            // Add items to cart
            await Cart.create({
                user: userId,
                items: [
                    {
                        product: product._id,
                        productName: product.name,
                        productImage: product.images[0].url,
                        quantity: 2,
                        sellingPrice: product.sellingPrice,
                        discount: product.discount || 0,
                        finalPrice: product.sellingPrice,
                        stock: product.stock,
                    },
                ],
            });

            const response = await request(app)
                .get('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.cart.items).toHaveLength(1);
        });

        it('should create empty cart if none exists', async () => {
            const response = await request(app)
                .get('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.cart.items).toHaveLength(0);
        });

        it('should return warnings for out-of-stock items', async () => {
            product.stock = 0;
            await product.save();

            await Cart.create({
                user: userId,
                items: [
                    {
                        product: product._id,
                        productName: product.name,
                        productImage: product.images[0].url,
                        quantity: 2,
                        sellingPrice: product.sellingPrice,
                        discount: product.discount || 0,
                        finalPrice: product.sellingPrice,
                        stock: 10, // Old stock value
                    },
                ],
            });

            const response = await request(app)
                .get('/api/v1/cart')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.data.warnings).toBeDefined();
            expect(response.body.data.warnings.length).toBeGreaterThan(0);
        });
    });
});
