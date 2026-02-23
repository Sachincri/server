import request from 'supertest';
import app from '../../../src/app';
import Product from '../../../src/models/Product.model';
import User from '../../../src/models/User.model';
import { Category } from '../../../src/models/Category.model';
import { generateMockUser, generateMockProduct, hashPassword } from '../../helpers/testHelpers';
import mongoose from 'mongoose';

describe('Products - Get Products', () => {
    // let adminToken: string;
    // let userToken: string;
    let category: any;

    let sellerId: string;

    beforeEach(async () => {
        // Create admin user
        const adminData = generateMockUser({ role: 'admin' });
        await User.create({
            ...adminData,
            password: await hashPassword(adminData.password),
            isVerified: true,
        });

        // Create regular user (seller)
        const userData = generateMockUser();
        const user = await User.create({
            ...userData,
            password: await hashPassword(userData.password),
            isVerified: true,
        });
        sellerId = user._id.toString();

        // Create category
        category = await Category.create({
            name: 'Electronics',
            slug: 'electronics',
            image: { public_id: 'test', url: 'http://example.com/image.jpg' },
        });
    });

    describe('GET /api/v1/products', () => {
        it('should return all active products', async () => {
            // Create test products
            await Product.create([
                generateMockProduct({ category: category._id, isActive: true, seller: sellerId, slug: 'p1' }),
                generateMockProduct({ category: category._id, isActive: true, seller: sellerId, slug: 'p2' }),
                generateMockProduct({ category: category._id, isActive: false, seller: sellerId, slug: 'p3' }), // Inactive
            ]);

            const response = await request(app)
                .get('/api/v1/products')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.productsCount).toBeGreaterThanOrEqual(3);
        });

        it('should support pagination', async () => {
            // Create 15 products
            const products = Array.from({ length: 15 }, (_, i) =>
                generateMockProduct({ category: category._id, isActive: true, seller: sellerId, slug: `prod-${i}` })
            );
            await Product.create(products);

            // Get first page (default 12 per page)
            const page1 = await request(app)
                .get('/api/v1/products?page=1')
                .expect(200);

            expect(page1.body.data.products).toHaveLength(12);
            expect(page1.body.data.currentPage).toBe(1);

            // Get second page
            const page2 = await request(app)
                .get('/api/v1/products?page=2')
                .expect(200);

            expect(page2.body.data.products).toHaveLength(3);
            expect(page2.body.data.currentPage).toBe(2);
        });

        it('should support custom limit', async () => {
            await Product.create([
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'l1' }),
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'l2' }),
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'l3' }),
            ]);

            const response = await request(app)
                .get('/api/v1/products?limit=2')
                .expect(200);

            expect(response.body.data.products).toHaveLength(2);
            expect(response.body.data.resultPerPage).toBe(2);
        });

        it('should support search by keyword', async () => {
            await Product.create([
                generateMockProduct({ name: 'iPhone 15 Pro', category: category._id, seller: sellerId, slug: 'iphone' }),
                generateMockProduct({ name: 'Samsung Galaxy S24', category: category._id, seller: sellerId, slug: 'samsung' }),
                generateMockProduct({ name: 'MacBook Pro', category: category._id, seller: sellerId, slug: 'macbook' }),
            ]);

            const response = await request(app)
                .get('/api/v1/products?keyword=iphone')
                .expect(200);

            expect(response.body.data.products.length).toBeGreaterThan(0);
            expect(response.body.data.products[0].name).toContain('iPhone');
        });

        it('should filter by price range', async () => {
            await Product.create([
                generateMockProduct({ sellingPrice: 500, category: category._id, seller: sellerId, slug: 'price1' }),
                generateMockProduct({ sellingPrice: 1500, category: category._id, seller: sellerId, slug: 'price2' }),
                generateMockProduct({ sellingPrice: 2500, category: category._id, seller: sellerId, slug: 'price3' }),
            ]);

            const response = await request(app)
                .get('/api/v1/products?price[gte]=1000&price[lte]=2000')
                .expect(200);

            expect(response.body.data.products).toHaveLength(1);
            expect(response.body.data.products[0].sellingPrice).toBe(1500);
        });

        it('should filter by category', async () => {
            const category2 = await Category.create({
                name: 'Clothing',
                slug: 'clothing',
                image: { public_id: 'test', url: 'http://example.com/image.jpg' },
            });

            await Product.create([
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'c1' }),
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'c2' }),
                generateMockProduct({ category: category2._id, seller: sellerId, slug: 'c3' }),
            ]);

            const response = await request(app)
                .get(`/api/v1/products?category=${category._id}`)
                .expect(200);

            expect(response.body.data.products).toHaveLength(2);
        });

        it('should return total pages info', async () => {
            await Product.create(
                Array.from({ length: 25 }, (_, i) => generateMockProduct({ category: category._id, seller: sellerId, slug: `page-${i}` }))
            );

            const response = await request(app)
                .get('/api/v1/products?limit=10')
                .expect(200);

            expect(response.body.data.totalPages).toBe(3); // 25 products / 10 per page = 3 pages
        });
    });

    describe('GET /api/v1/products/:id', () => {
        it('should return product details by ID', async () => {
            const product = await Product.create(
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'det1' })
            );

            const response = await request(app)
                .get(`/api/v1/products/${product._id}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.product._id).toBe((product as any)._id.toString());
            expect(response.body.data.product.name).toBe((product as any).name);
        });

        it('should populate category information', async () => {
            const product = await Product.create(
                generateMockProduct({ category: category._id, seller: sellerId, slug: 'det2' })
            );

            const response = await request(app)
                .get(`/api/v1/products/${product._id}`)
                .expect(200);

            expect(response.body.data.product.category).toBeDefined();
            expect(response.body.data.product.category.name).toBe('Electronics');
        });

        it('should return 404 for non-existent product', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/v1/products/${fakeId}`)
                .expect(404);

            expect(response.body.success).toBe(false);
        });

        it('should return 404 for invalid product ID (treated as slug)', async () => {
            const response = await request(app)
                .get('/api/v1/products/invalid-id')
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });
});
