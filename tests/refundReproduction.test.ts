
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import { Payment } from '../src/models/Payment.model';
import Order from '../src/models/Order.model';
import User from '../src/models/User.model';
import jwt from 'jsonwebtoken';

describe('Refund Payment Reproduction', () => {
    let adminToken: string;
    let paymentId: string;
    let orderId: string;

    beforeAll(async () => {
        // Create admin user
        const admin = await User.create({
            name: 'Admin',
            email: 'admin_test@example.com',
            password: 'password123',
            phone: 1234567890,
            role: 'admin'
        });
        adminToken = jwt.sign({ id: admin._id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

        // Create successful payment
        const payment = await Payment.create({
            razorpay_payment_id: 'pay_test_' + Date.now(),
            amount: 100,
            currency: 'INR',
            status: 'success'
        });
        paymentId = (payment as any)._id.toString();

        // Create order
        const order = await Order.create({
            shippingInfo: {
                firstName: 'Test',
                lastName: 'User',
                address: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                country: 'India',
                pinCode: 123456,
                phoneNo: '1234567890'
            },
            orderItems: [
                {
                    name: 'Test Product',
                    sellingPrice: 100,
                    quantity: 1,
                    image: 'test.jpg',
                    product: new mongoose.Types.ObjectId()
                }
            ],
            user: admin._id,
            paymentInfo: {
                id: paymentId,
                status: 'Succeeded',
                method: 'card'
            },
            itemsPrice: 100,
            taxPrice: 0,
            shippingPrice: 0,
            totalPrice: 100,
            orderStatus: 'Processing',
            paidAt: new Date()
        });
        orderId = (order as any)._id.toString();
    });

    afterAll(async () => {
        await User.deleteMany({ email: 'admin_test@example.com' });
        await Payment.findByIdAndDelete(paymentId);
        await Order.findByIdAndDelete(orderId);
    });

    it('should return 400 if payment is unsuccessful (e.g. razorpay error)', async () => {
        // This will likely fail with 401/400 because of wrong keys, which is what we want to see
        const res = await request(app)
            .post('/api/v1/payment/admin/payment/refund')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                paymentId: paymentId,
                reason: 'Test refund'
            });

        console.log('REPRODUCTION STATUS:', res.status);
        console.log('REPRODUCTION BODY:', JSON.stringify(res.body, null, 2));
    });
});
