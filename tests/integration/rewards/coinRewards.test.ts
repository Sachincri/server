import request from 'supertest';
import app from '../../../src/app';
import User from '../../../src/models/User.model';
import Order from '../../../src/models/Order.model';
import Product from '../../../src/models/Product.model';
import { Cart } from '../../../src/models/Cart.model';
import CoinLedger from '../../../src/models/CoinLedger.model';
import { generateAuthToken, generateMockUser, generateMockProduct } from '../../helpers/testHelpers';
import mongoose from 'mongoose';

describe('Coin Reward System', () => {
    jest.setTimeout(60000);
    let userToken: string;
    let userId: string;
    let productId: string;
    let productPrice = 1000;

    beforeEach(async () => {
        // Create User
        const mockUser = generateMockUser();
        const user = await User.create({ ...mockUser, isEmailVerified: true });
        userId = user._id.toString();
        userToken = generateAuthToken(userId, 'user');

        // Create Product
        const mockProduct = generateMockProduct({
            sellingPrice: productPrice,
            stock: 100,
            seller: userId,
            category: new mongoose.Types.ObjectId(),
            slug: 'test-product-slug'
        });
        const product = await Product.create(mockProduct);
        productId = (product as any)._id.toString();

        // Create Cart
        await Cart.create({
            user: userId,
            items: [{
                product: productId,
                productName: 'Test Product',
                productImage: 'test_image.jpg',
                quantity: 1,
                sellingPrice: productPrice,
                finalPrice: productPrice,
                stock: 100,
            }],
            total: productPrice,
            subtotal: productPrice,
            itemCount: 1
        });
    });

    afterEach(async () => {
        await User.deleteMany({});
        await Order.deleteMany({});
        await Product.deleteMany({});
        await Cart.deleteMany({});
        await CoinLedger.deleteMany({});
    });

    it('should earn coins when order is delivered', async () => {
        // 1. Create Order
        const orderData = {
            // items required by validator but ignored by controller (uses Cart)
            items: [{ product: productId, quantity: 1, price: productPrice }],
            shippingInfo: {
                firstName: 'Test',
                lastName: 'User',
                address: '123 Test Street, New York',
                city: 'City',
                state: 'State',
                country: 'India',
                pinCode: '12345',
                phoneNo: '1234567890'
            },
            paymentInfo: { id: 'pay_123', status: 'succeeded', method: 'card' },
        };

        const createRes = await request(app)
            .post('/api/v1/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send(orderData)
            .expect(201);

        const orderId = createRes.body.data.order._id;

        // 2. Deliver Order (Admin)
        const adminMock = generateMockUser({ role: 'admin', email: 'admin@example.com' });
        const admin = await User.create({ ...adminMock, isEmailVerified: true });
        const adminToken = generateAuthToken(admin._id.toString(), 'admin');

        // Transition through intermediate statuses
        await request(app)
            .patch(`/api/v1/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'processing' })
            .expect(200);

        await request(app)
            .patch(`/api/v1/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'shipped' })
            .expect(200);

        await request(app)
            .patch(`/api/v1/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'delivered' })
            .expect(200);

        // 3. Verify Coins Earned
        const updatedUser = await User.findById(userId);
        const ledgerEntry = await CoinLedger.findOne({ user: userId, type: 'earn', order: orderId });
        const updatedOrder = await Order.findById(orderId);

        // Logic: updateOrderStatus earns 10% of totalPrice
        // totalPrice = itemsPrice (1000) + shippingCharges
        // Since itemsPrice (1000) > freeDeliveryThreshold (500 default), shippingCharges = 0
        // So totalPrice = 1000, expectedCoins = Math.floor(1000 * 0.1) = 100
        const expectedCoins = Math.floor(productPrice * 0.1);

        expect(updatedUser?.rewardPoints).toBe(expectedCoins);
        expect(updatedOrder?.coinsEarned).toBe(expectedCoins);
        expect(ledgerEntry).toBeTruthy();
        expect(ledgerEntry?.amount).toBe(expectedCoins);
        expect(ledgerEntry?.expiresAt).toBeDefined();
    });

    it('should redeem coins during order creation', async () => {
        // 1. Give User Coins
        await User.findByIdAndUpdate(userId, { rewardPoints: 500 });

        // 2. Set cart to redeem coins (middleware reads cart.isCoinsRedeemed, not request body)
        await Cart.findOneAndUpdate({ user: userId }, { isCoinsRedeemed: true });

        const orderData = {
            items: [{ product: productId, quantity: 1, price: productPrice }],
            shippingInfo: {
                firstName: 'Test',
                lastName: 'User',
                address: '123 Test Street, New York',
                city: 'City',
                state: 'State',
                country: 'India',
                pinCode: '12345',
                phoneNo: '1234567890'
            },
            paymentInfo: { id: 'pay_123', status: 'succeeded', method: 'card' },
        };

        const res = await request(app)
            .post('/api/v1/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send(orderData)
            .expect(201);

        // 3. Verify Deduction
        // Middleware uses: maxAllowedDiscount = Math.floor(500 * 20 / 100) = 100
        // coinsToRedeem = Math.min(100, finalAmount=1000) = 100, so 500 - 100 = 400
        const updatedUser = await User.findById(userId);
        const ledgerEntry = await CoinLedger.findOne({ user: userId, type: 'redeem' });
        const redeemAmount = 200; // 20% of 1000 (finalAmount)

        expect(updatedUser?.rewardPoints).toBe(300); // 500 - 200
        expect(res.body.data.order.redeemCoins).toBe(redeemAmount);
        expect(ledgerEntry?.amount).toBe(-redeemAmount);
    });
});
