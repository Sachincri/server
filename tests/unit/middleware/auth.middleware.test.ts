import { Request, Response, NextFunction } from 'express';
import { protect, restrictTo } from '../../../src/middleware/auth.middleware';
import User from '../../../src/models/User.model';
import { generateMockUser, generateAuthToken } from '../../helpers/testHelpers';
import ApiError from '../../../src/utils/apiError';

describe('Auth Middleware', () => {
    describe('protect middleware', () => {
        let req: Partial<Request>;
        let res: Partial<Response>;
        let next: NextFunction;

        const waitForMiddleware = async () => new Promise(resolve => setTimeout(resolve, 100));

        beforeEach(() => {
            process.env.JWT_SECRET = 'test-secret';
            req = {
                headers: {},
                cookies: {},
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };
            next = jest.fn();
        });

        it('should authenticate user with valid Bearer token', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                isEmailVerified: true,
            });

            const token = generateAuthToken(user._id.toString(), 'user');
            req.headers = { authorization: `Bearer ${token}` };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith();
            expect((req as any).user).toBeDefined();
            expect((req as any).user._id.toString()).toBe(user._id.toString());
        });

        it('should authenticate user with cookie token', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                isEmailVerified: true,
            });

            const token = generateAuthToken(user._id.toString(), 'user');
            req.cookies = { jwt: token };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith();
            expect((req as any).user).toBeDefined();
        });

        it('should reject request without token', async () => {
            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
            const error = (next as jest.Mock).mock.calls[0][0];
            expect(error.statusCode).toBe(401);
        });

        it('should reject request with invalid token', async () => {
            req.headers = { authorization: 'Bearer invalid_token' };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should reject request for non-existent user', async () => {
            const fakeUserId = '507f1f77bcf86cd799439011';
            const token = generateAuthToken(fakeUserId, 'user');
            req.headers = { authorization: `Bearer ${token}` };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        });

        it('should reject request for inactive user', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                isEmailVerified: true,
                active: false,
            });

            const token = generateAuthToken(user._id.toString(), 'user');
            req.headers = { authorization: `Bearer ${token}` };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        });

        it('should reject if password changed after token issued', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                isEmailVerified: true,
            });

            const token = generateAuthToken(user._id.toString(), 'user');

            // Set passwordChangedAt to future
            const futureTime = new Date(Date.now() + 2000);
            await User.findByIdAndUpdate(user._id, { passwordChangedAt: futureTime });

            req.headers = { authorization: `Bearer ${token}` };

            await protect(req as any, res as Response, next);
            await waitForMiddleware();

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        });
    });

    describe('restrictTo middleware', () => {
        let req: Partial<Request>;
        let res: Partial<Response>;
        let next: NextFunction;

        beforeEach(() => {
            req = {
                user: undefined,
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };
            next = jest.fn();
        });

        it('should allow access for authorized role', () => {
            req.user = { _id: '123', role: 'admin' } as any;
            const middleware = restrictTo('admin');

            middleware(req as any, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should allow access for multiple authorized roles', () => {
            req.user = { _id: '123', role: 'admin' } as any;
            const middleware = restrictTo('admin', 'moderator');

            middleware(req as any, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should deny access for unauthorized role', () => {
            req.user = { _id: '123', role: 'user' } as any;
            const middleware = restrictTo('admin');

            expect(() => {
                middleware(req as any, res as Response, next);
            }).toThrow(ApiError);

            expect(next).not.toHaveBeenCalled();
        });

        it('should deny access if user not set', () => {
            const middleware = restrictTo('admin');

            expect(() => {
                middleware(req as any, res as Response, next);
            }).toThrow(ApiError);

            expect(next).not.toHaveBeenCalled();
        });
    });
});
