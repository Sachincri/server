import request from 'supertest';
import validator from 'validator';
import app from '../../../src/app';
import User from '../../../src/models/User.model';
import { generateMockUser } from '../../helpers/testHelpers';

describe('Auth - Register', () => {
    const waitForUser = async (email: string, selectPassword = false): Promise<any> => {
        const normalizedEmail = validator.normalizeEmail(email) || email.toLowerCase();

        for (let i = 0; i < 10; i++) {
            let query = User.findOne({ email: normalizedEmail });
            if (selectPassword) query = query.select('+password');
            const user = await query;
            if (user) return user;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return null;
    };

    describe('POST /api/v1/auth/register', () => {
        it('should register a new user successfully', async () => {
            const userData = generateMockUser();

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Registration successful');

            // Verify user was created in database (with retry for stability)
            const user = await waitForUser(userData.email);
            expect(user).toBeTruthy();
            expect(user?.name).toBe(userData.name);
        });

        it('should return validation error for missing required fields', async () => {
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    name: 'Test User',
                    // Missing email, phone, password
                })
                .expect(422);

            expect(response.body.success).toBe(false);
            expect(response.body.errors).toBeDefined();
        });

        it('should return validation error for invalid email', async () => {
            const userData = generateMockUser({ email: 'invalid-email' });

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(422);

            expect(response.body.success).toBe(false);
        });

        it('should return validation error for weak password', async () => {
            const userData = generateMockUser({ password: '123' });

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(422);

            expect(response.body.success).toBe(false);
        });

        it('should return error for duplicate email', async () => {
            const userData = generateMockUser();
            const normalizedEmail = validator.normalizeEmail(userData.email) || userData.email.toLowerCase();

            // Create first user
            await User.create({
                ...userData,
                email: normalizedEmail,
                password: userData.password,
            });

            // Try to register with same email
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('already');
        });

        it('should return error for duplicate phone', async () => {
            const userData1 = generateMockUser();
            const userData2 = generateMockUser({ phone: userData1.phone });

            // Create first user
            await User.create({
                ...userData1,
                email: validator.normalizeEmail(userData1.email) || userData1.email.toLowerCase(),
                password: userData1.password,
            });

            // Try to register with same phone
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData2)
                .expect(409);

            expect(response.body.success).toBe(false);
        });

        it('should hash password before saving', async () => {
            const userData = generateMockUser();

            await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(201);

            // Verify user was created in database (with retry for stability)
            const user = await waitForUser(userData.email, true);
            expect(user?.password).toBeDefined();
            expect(user?.password).not.toBe(userData.password);
        });

        it('should set default role to user', async () => {
            const userData = generateMockUser();

            await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(201);

            // Verify user was created in database (with retry for stability)
            const user = await waitForUser(userData.email);
            expect(user?.role).toBe('user');
        });

        it('should not allow setting admin role during registration', async () => {
            const userData = generateMockUser({ role: 'admin' });

            await request(app)
                .post('/api/v1/auth/register')
                .send(userData)
                .expect(201);

            // Verify user was created in database (with retry for stability)
            const user = await waitForUser(userData.email);
            expect(user?.role).toBe('user'); // Should ignore admin role
        });
    });
});
