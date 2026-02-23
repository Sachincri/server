# Test Suite Documentation

## Overview

This test suite provides comprehensive coverage for the Express/TypeScript e-commerce backend application using Jest and Supertest.

## Test Structure

```
tests/
├── setup.ts                          # Global test setup with MongoDB Memory Server
├── helpers/
│   └── testHelpers.ts               # Mock data generators and utilities
├── mocks/
│   └── externalServices.ts          # Mocks for Cloudinary, Razorpay, Nodemailer
├── unit/
│   ├── utils/
│   │   ├── apiError.test.ts        # ApiError utility tests
│   │   └── helper.test.ts          # Helper function tests
│   └── middleware/
│       └── auth.middleware.test.ts  # Authentication middleware tests
├── models/
│   ├── User.test.ts                # User model tests
│   └── Product.test.ts             # Product model tests
└── integration/
    ├── auth/
    │   ├── register.test.ts        # User registration tests
    │   └── login.test.ts           # User login/logout tests
    ├── products/
    │   └── getProducts.test.ts     # Product listing and filtering tests
    ├── cart/
    │   └── cart.test.ts            # Cart operations tests
    ├── orders/
    │   └── orders.test.ts          # Order management tests
    └── payment/
        └── payment.test.ts         # Payment processing tests
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run tests with verbose output
```bash
npm run test:verbose
```

### Run specific test file
```bash
npm test -- tests/integration/auth/login.test.ts
```

### Run tests matching pattern
```bash
npm test -- --testNamePattern="should login user"
```

## Test Coverage

The test suite covers:

- **Unit Tests**: Utilities, helpers, middleware, and models
- **Integration Tests**: API endpoints for all major features
- **Authentication**: Registration, login, logout, OTP verification
- **Products**: CRUD operations, search, filtering, pagination
- **Cart**: Add/remove items, quantity updates, stock validation
- **Orders**: Order creation, status updates, user/admin access
- **Payment**: Razorpay integration, payment verification

## Coverage Thresholds

Minimum coverage requirements (configured in jest.config.js):
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## Test Database

Tests use MongoDB Memory Server for isolated, in-memory testing. Each test suite:
1. Starts a fresh MongoDB instance
2. Runs tests in isolation
3. Cleans up all data after each test
4. Shuts down the database after all tests

## Mocking External Services

External services are mocked to avoid actual API calls:

- **Cloudinary**: Image upload/delete operations
- **Razorpay**: Payment order creation and verification
- **Nodemailer**: Email sending

## Writing New Tests

### Example Test Structure

```typescript
import request from 'supertest';
import app from '../../../src/app';
import User from '../../../src/models/User.model';
import { generateMockUser, generateAuthToken } from '../../helpers/testHelpers';

describe('Feature Name', () => {
  let userToken: string;

  beforeEach(async () => {
    // Setup test data
    const user = await User.create(generateMockUser());
    userToken = generateAuthToken(user._id.toString(), 'user');
  });

  describe('POST /api/v1/endpoint', () => {
    it('should perform action successfully', async () => {
      const response = await request(app)
        .post('/api/v1/endpoint')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ data: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Use `afterEach` to clean up test data
3. **Descriptive Names**: Use clear, descriptive test names
4. **Arrange-Act-Assert**: Follow AAA pattern in tests
5. **Mock External Services**: Never make real API calls in tests
6. **Test Edge Cases**: Include tests for error conditions and edge cases

## Troubleshooting

### Tests hanging
- Check for unclosed database connections
- Ensure async operations are properly awaited

### MongoDB Memory Server issues
- Increase timeout in jest.config.js
- Check system memory availability

### Token/Auth issues
- Verify JWT_SECRET is set in test environment
- Check token expiration settings

## CI/CD Integration

To run tests in CI/CD pipeline:

```yaml
test:
  script:
    - npm install
    - npm test
  coverage: '/All files[^|]*\\|[^|]*\\s+([\\d\\.]+)/'
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
