import validator from 'validator';
import request from 'supertest';
import app from '../../../src/app';
import User from '../../../src/models/User.model';
import { generateMockUser } from '../../helpers/testHelpers';

describe('Auth - Login', () => {
    describe('POST /api/v1/auth/login', () => {
        it('should login user with valid credentials', async () => {
            const userData = generateMockUser();
            // const hashedPassword = await hashPassword(userData.password);

            // Create user
            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data.user.email).toBe(validator.normalizeEmail(userData.email));
        });

        it('should login user with phone number', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.phone, // Using phone as email field
                    password: userData.password,
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
        });

        it('should return error for non-existent user', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'Password123!',
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid');
        });

        it('should return error for incorrect password', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: 'WrongPassword123!',
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should return error for unverified user', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: false,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                })
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('verify');
        });

        it('should return error for inactive user', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
                active: false,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should set JWT cookie on successful login', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                })
                .expect(200);

            const cookies = response.headers['set-cookie'];
            expect(cookies).toBeDefined();
            const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
            expect(cookieArray.some((cookie: string) => cookie.startsWith('jwt='))).toBe(true);
        });

        it('should return validation error for missing credentials', async () => {
            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({})
                .expect(422);

            expect(response.body.success).toBe(false);
            expect(response.body.errors).toBeDefined();
        });
    });

    describe('POST /api/v1/auth/logout', () => {
        it('should logout authenticated user', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            // Login first
            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                });

            const token = loginResponse.body.data.accessToken;

            // Logout
            const response = await request(app)
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should return error for unauthenticated request', async () => {
            const response = await request(app)
                .post('/api/v1/auth/logout')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/auth/me', () => {
        it('should return current user data', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: userData.password,
                isEmailVerified: true,
            });

            // Login
            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: userData.email,
                    password: userData.password,
                });

            const token = loginResponse.body.data.accessToken;

            // Get current user
            const response = await request(app)
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.email).toBe(validator.normalizeEmail(userData.email));
            expect(response.body.data.user).not.toHaveProperty('password');
        });

        it('should return error for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/v1/auth/me')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});
