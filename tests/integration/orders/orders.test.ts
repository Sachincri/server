import request from 'supertest';
import app from '../../../src/app';
import Order from '../../../src/models/Order.model';
import Product from '../../../src/models/Product.model';
import User from '../../../src/models/User.model';
import { Cart } from '../../../src/models/Cart.model';
import { Category } from '../../../src/models/Category.model';
import { generateMockUser, generateMockProduct, generateMockOrder, generateAuthToken, hashPassword } from '../../helpers/testHelpers';

describe('Orders', () => {
    let userToken: string;
    let adminToken: string;
    let userId: string;
    let adminId: string;
    let product: any;
    let category: any;

    beforeEach(async () => {
        // Create user
        const userData = generateMockUser();
        const user = await User.create({
            ...userData,
            password: await hashPassword(userData.password),
            isEmailVerified: true,
        });
        userId = user._id.toString();
        userToken = generateAuthToken(userId, 'user');

        // Create admin
        const adminData = generateMockUser({ role: 'admin' });
        const admin = await User.create({
            ...adminData,
            password: await hashPassword(adminData.password),
            isEmailVerified: true,
        });
        adminId = admin._id.toString();
        adminToken = generateAuthToken(adminId, 'admin');

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
                seller: userId,
                slug: 'test-product-orders',
            })
        );

        // Ensure product images exist for cart mapping
        if (!product.images || product.images.length === 0) {
            product.images = [{ public_id: 'p', url: 'u' }];
            await product.save();
        }

        // Create Cart (Default for most tests)
        await Cart.create({
            user: userId,
            items: [{
                product: product._id,
                productName: product.name,
                productImage: product.images[0].url,
                quantity: 2,
                sellingPrice: product.sellingPrice,
                finalPrice: product.sellingPrice,
                stock: product.stock,
                variant: { size: 'M' }
            }],
            total: product.sellingPrice * 2,
            subtotal: product.sellingPrice * 2,
            itemCount: 2
        });
    });

    describe('POST /api/v1/orders', () => {
        it('should create order successfully', async () => {
            const orderData = {
                // items in body mainly for validator
                items: [{ product: product._id, quantity: 2 }],
                shippingInfo: {
                    firstName: 'Test',
                    lastName: 'User',
                    address: '123 Test St',
                    city: 'Test City',
                    state: 'Test State',
                    country: 'India',
                    pinCode: '123456',
                    phoneNo: '9999999999',
                },
                paymentInfo: {
                    id: 'test_payment_id',
                    status: 'succeeded',
                    method: 'card'
                },
            };

            const response = await request(app)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${userToken}`)
                .send(orderData);

            expect(response.status).toBe(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.order).toBeDefined();
            // Total price logic: 2000 items + fees?
            // Middleware calculates it. Just check it exists.
            expect(response.body.data.order.totalPrice).toBeGreaterThan(0);
            expect(response.body.data.order.orderStatus).toBe('placed');
        });

        it('should reduce product stock after order', async () => {
            const initialStock = product.stock;

            // Update Cart to quantity 3
            await Cart.findOneAndUpdate({ user: userId }, {
                items: [{
                    product: product._id,
                    productName: product.name,
                    productImage: product.images[0].url,
                    quantity: 3,
                    sellingPrice: product.sellingPrice,
                    finalPrice: product.sellingPrice,
                    stock: product.stock
                }],
                total: product.sellingPrice * 3,
                itemCount: 3
            });

            const orderData = {
                items: [{ product: product._id, quantity: 3 }],
                shippingInfo: {
                    firstName: 'Test',
                    lastName: 'User',
                    address: '123 Test St',
                    city: 'Test City',
                    state: 'Test State',
                    country: 'India',
                    pinCode: '123456',
                    phoneNo: '9999999999',
                },
                paymentInfo: {
                    id: 'test_payment_id',
                    status: 'succeeded',
                    method: 'card'
                },
            };

            await request(app)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${userToken}`)
                .send(orderData)
                .expect(201);

            const updatedProduct = await Product.findById(product._id);
            expect(updatedProduct?.stock).toBe(initialStock - 3);
        });

        it('should return error if product out of stock', async () => {
            // Update Cart to exceed stock (15 > 10)
            await Cart.findOneAndUpdate({ user: userId }, {
                items: [{
                    product: product._id,
                    productName: product.name,
                    productImage: product.images[0].url,
                    quantity: 15,
                    sellingPrice: product.sellingPrice,
                    finalPrice: product.sellingPrice,
                    stock: product.stock
                }],
                total: product.sellingPrice * 15,
                itemCount: 15
            });

            const orderData = {
                items: [{ product: product._id, quantity: 15 }],
                shippingInfo: {
                    firstName: 'Test',
                    lastName: 'User',
                    address: '123 Test St',
                    city: 'Test City',
                    state: 'Test State',
                    country: 'India',
                    pinCode: '123456',
                    phoneNo: '9999999999',
                },
                paymentInfo: {
                    id: 'test_payment_id',
                    status: 'succeeded',
                    method: 'card'
                },
            };

            const response = await request(app)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${userToken}`)
                .send(orderData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Insufficient stock');
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .post('/api/v1/orders')
                .send({})
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/orders/me', () => {
        it('should return user orders', async () => {
            // Create orders
            await Order.create([
                generateMockOrder(userId),
                generateMockOrder(userId),
            ]);

            const response = await request(app)
                .get('/api/v1/orders/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.orders).toHaveLength(2);
        });

        it('should not return other users orders', async () => {
            const otherUser = await User.create({
                ...generateMockUser(),
                password: await hashPassword('Password123!'),
                isEmailVerified: true,
            });

            await Order.create([
                generateMockOrder(userId),
                generateMockOrder(otherUser._id.toString()),
            ]);

            const response = await request(app)
                .get('/api/v1/orders/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.data.orders).toHaveLength(1);
        });
    });

    describe('GET /api/v1/orders/:id', () => {
        it('should return order details', async () => {
            const order = await Order.create(generateMockOrder(userId));

            const response = await request(app)
                .get(`/api/v1/orders/${order._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);
            const dbId = order._id?.toString();
            expect(response.body.success).toBe(true);
            expect(response.body.data.order._id).toBe(dbId);
        });

        it('should not allow accessing other users orders', async () => {
            const otherUser = await User.create({
                ...generateMockUser(),
                password: await hashPassword('Password123!'),
                isEmailVerified: true,
            });


            const order = await Order.create(generateMockOrder(otherUser._id.toString()));

            const response = await request(app)
                .get(`/api/v1/orders/${order._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
        });

        it('should allow admin to access any order', async () => {
            const order = await Order.create(generateMockOrder(userId));

            const response = await request(app)
                .get(`/api/v1/orders/${order._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('PATCH /api/v1/orders/:id/status', () => {
        it('should allow admin to update order status', async () => {
            const order = await Order.create(generateMockOrder(userId));

            const response = await request(app)
                .patch(`/api/v1/orders/${order._id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'processing' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.order.orderStatus).toBe('processing');
        });

        it('should not allow regular user to update status', async () => {
            const order = await Order.create(generateMockOrder(userId));

            const response = await request(app)
                .patch(`/api/v1/orders/${order._id}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'shipped' })
                .expect(403); // restrictTo returns 403

            expect(response.body.success).toBe(false);
        });

        it('should set deliveredAt when status is Delivered', async () => {
            const order = await Order.create({ ...generateMockOrder(userId), orderStatus: 'shipped' });

            const response = await request(app)
                .patch(`/api/v1/orders/${order._id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'delivered' })
                .expect(200);

            expect(response.body.data.order.deliveredAt).toBeDefined();
        });
    });

    describe('DELETE /api/v1/orders/:id', () => {
        it('should allow admin to delete order', async () => {
            // Only cancelled orders can be deleted
            const order = await Order.create({ ...generateMockOrder(userId), orderStatus: 'cancelled' });

            const response = await request(app)
                .delete(`/api/v1/orders/${order._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);

            const deletedOrder = await Order.findById(order._id);
            expect(deletedOrder).toBeNull();
        });

        it('should not allow regular user to delete order', async () => {
            const order = await Order.create({ ...generateMockOrder(userId), orderStatus: 'cancelled' });

            const response = await request(app)
                .delete(`/api/v1/orders/${order._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
        });
    });
});
