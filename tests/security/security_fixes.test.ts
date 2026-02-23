import request from 'supertest';
import app from '../../src/app';
import User from '../../src/models/User.model';
import { generateMockUser } from '../helpers/testHelpers';
import crypto from 'crypto';

describe('Security Fixes', () => {

    beforeAll(() => {
        process.env.RAZORPAY_WEBHOOK_SECRET = 'test_secret';
    });

    describe('POST /api/v1/payment/webhook', () => {
        it('should be accessible without authentication', async () => {
            // We check if we get 400 (signature missing) instead of 401
            const response = await request(app)
                .post('/api/v1/payment/webhook')
                .send({});

            expect(response.status).not.toBe(401);
            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Missing webhook signature.');
        });

        it('should verify signature using raw body', async () => {
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET as string;

            const payload = {
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_test_123",
                            status: "captured"
                        }
                    }
                }
            };

            const bodyString = JSON.stringify(payload);
            const signature = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');

            const response = await request(app)
                .post('/api/v1/payment/webhook')
                .set('x-razorpay-signature', signature)
                .send(payload)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('POST /api/v1/auth/logout', () => {
        it('should invalidate refresh token on logout', async () => {
            const userData = generateMockUser();
            // Don't hash password here, User model does it
            const password = userData.password;

            const user = await User.create({
                ...userData,
                password: password,
                isEmailVerified: true,
                active: true,
            });

            // Login
            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                })
                .expect(200);

            const token = loginResponse.body.data.accessToken;

            // Check if user has refresh token in DB
            // Need to select +refreshToken because it is select: false? 
            // Checking model source: refreshToken doesn't have select: false, typically. Let's check model again if needed.
            // But AuthService explicitly unsets it for user object returned, but DB should have it.
            // Model: refreshToken: String. Not select: false by default unless specified.
            let userInDb = await User.findById(user._id);
            expect(userInDb!.refreshToken).toBeDefined();

            // Logout
            await request(app)
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            // Check if user has NO refresh token
            userInDb = await User.findById(user._id);
            expect(userInDb!.refreshToken).toBeUndefined();
        });
    });
});
