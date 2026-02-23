import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

/**
 * Generate a JWT token for testing
 */
export const generateAuthToken = (userId: string, role: string = 'user'): string => {
    const payload = {
        id: userId,
        role,
        iat: Math.floor(Date.now() / 1000),
    };
    return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
        expiresIn: '1d',
    });
};

/**
 * Generate mock user data
 */
export const generateMockUser = (overrides: any = {}) => {
    return {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        phone: faker.string.numeric(10),
        password: 'Password123!',
        role: 'user',
        ...overrides,
    };
};

/**
 * Generate mock product data
 */
export const generateMockProduct = (overrides: any = {}) => {
    const product = {
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        sellingPrice: parseFloat(faker.commerce.price({ min: 100, max: 10000 })),
        maximumRetailPrice: parseFloat(faker.commerce.price({ min: 150, max: 12000 })),
        stock: faker.number.int({ min: 0, max: 100 }),
        discount: faker.number.int({ min: 0, max: 50 }),
        images: [
            {
                public_id: faker.string.uuid(),
                url: faker.image.url(),
            },
        ],
        isActive: true,
        slug: faker.helpers.slugify(faker.commerce.productName()),
        seller: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId(),
        ...overrides,
    };
    return product;
};

/**
 * Generate mock cart item
 */
export const generateMockCartItem = (productId: string, overrides: any = {}) => {
    const sellingPrice = parseFloat(faker.commerce.price({ min: 100, max: 1000 }));
    return {
        product: productId,
        productName: faker.commerce.productName(),
        productImage: faker.image.url(),
        quantity: faker.number.int({ min: 1, max: 5 }),
        sellingPrice,
        discount: 0,
        finalPrice: sellingPrice,
        stock: faker.number.int({ min: 1, max: 100 }),
        ...overrides,
    };
};

/**
 * Generate mock order data
 */
export const generateMockOrder = (userId: string, overrides: any = {}) => {
    const sellingPrice = parseFloat(faker.commerce.price({ min: 100, max: 1000 }));
    return {
        user: userId,
        shippingInfo: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            address: faker.location.streetAddress(),
            city: faker.location.city(),
            state: faker.location.state(),
            country: 'India',
            pinCode: faker.location.zipCode('#####'),
            phoneNo: faker.string.numeric(10),
        },
        orderItems: [
            {
                name: faker.commerce.productName(),
                sellingPrice,
                quantity: faker.number.int({ min: 1, max: 3 }),
                image: faker.image.url(),
                product: faker.database.mongodbObjectId(),
                status: 'Processing',
            },
        ],
        itemsPrice: sellingPrice,
        taxPrice: 0,
        shippingPrice: 0,
        totalPrice: sellingPrice,
        redeemCoins: 0,
        orderStatus: 'placed',
        paidAt: new Date(),
        paymentInfo: {
            id: 'sample_payment_id',
            status: 'succeeded',
            method: 'card'
        },
        ...overrides,
    };
};

/**
 * Hash password for testing
 */
export const hashPassword = async (password: string): Promise<string> => {
    return await bcrypt.hash(password, 10);
};

/**
 * Wait for a specified time (useful for async operations)
 */
export const wait = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create authenticated request headers
 */
export const getAuthHeaders = (token: string) => {
    return {
        Authorization: `Bearer ${token}`,
    };
};
