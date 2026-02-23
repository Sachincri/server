import ApiError from '../../../src/utils/apiError';

describe('ApiError Utility', () => {
    describe('badRequest', () => {
        it('should create a 400 error', () => {
            const error = ApiError.badRequest('Invalid input');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Invalid input');
            expect(error.status).toBe('fail');
        });
    });

    describe('unauthorized', () => {
        it('should create a 401 error', () => {
            const error = ApiError.unauthorized('Not authenticated');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Not authenticated');
            expect(error.status).toBe('fail');
        });
    });

    describe('forbidden', () => {
        it('should create a 403 error', () => {
            const error = ApiError.forbidden('Access denied');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('Access denied');
            expect(error.status).toBe('fail');
        });
    });

    describe('notFound', () => {
        it('should create a 404 error', () => {
            const error = ApiError.notFound('Resource not found');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Resource not found');
            expect(error.status).toBe('fail');
        });
    });

    describe('conflict', () => {
        it('should create a 409 error', () => {
            const error = ApiError.conflict('Resource already exists');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(409);
            expect(error.message).toBe('Resource already exists');
            expect(error.status).toBe('fail');
        });
    });

    describe('validationError', () => {
        it('should create a 422 error with validation details', () => {
            const validationErrors = [
                { message: 'Email is required' },
                { message: 'Password must be at least 8 characters' },
            ];

            const error = ApiError.validationError(validationErrors);

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(422);
            expect(error.message).toBe('Validation failed');
            expect(error.errors).toEqual(validationErrors);
            expect(error.status).toBe('fail');
        });
    });

    describe('internal', () => {
        it('should create a 500 error', () => {
            const error = ApiError.internal('Server error');

            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(500);
            expect(error.message).toBe('Server error');
            expect(error.status).toBe('error');
        });

        it('should use default message if none provided', () => {
            const error = ApiError.internal();

            expect(error.message).toBe('Internal server error');
        });
    });

    describe('isOperational flag', () => {
        it('should mark errors as operational', () => {
            const error = ApiError.badRequest('Test');
            expect(error.isOperational).toBe(true);
        });
    });
});
