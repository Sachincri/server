import Product from '../../src/models/Product.model';
import { Category } from '../../src/models/Category.model';
import { generateMockProduct } from '../helpers/testHelpers';

describe('Product Model', () => {
    let category: any;

    beforeEach(async () => {
        category = await Category.create({
            name: 'Electronics',
            slug: 'electronics',
            image: { public_id: 'test', url: 'http://example.com/image.jpg' },
        });
    });

    describe('Schema Validation', () => {
        it('should create product with valid data', async () => {
            const productData = generateMockProduct({ category: category._id });
            const product = await Product.create(productData);

            expect(product).toBeDefined();
            expect(product.name).toBe(productData.name);
            expect(product.sellingPrice).toBe(productData.sellingPrice);
        });

        it('should require name', async () => {
            const productData = generateMockProduct({ category: category._id });
            delete (productData as any).name;

            await expect(Product.create(productData)).rejects.toThrow();
        });

        it('should require sellingPrice', async () => {
            const productData = generateMockProduct({ category: category._id });
            delete (productData as any).sellingPrice;

            await expect(Product.create(productData)).rejects.toThrow();
        });

        it('should require category', async () => {
            const productData = generateMockProduct();
            delete (productData as any).category;

            await expect(Product.create(productData)).rejects.toThrow();
        });

        it('should set default stock to 0', async () => {
            const productData = generateMockProduct({ category: category._id });
            delete (productData as any).stock;

            const product = await Product.create(productData);
            expect(product.stock).toBe(0);
        });

        it('should set default isActive to true', async () => {
            const productData = generateMockProduct({ category: category._id });
            const product = await Product.create(productData);

            expect(product.isActive).toBe(true);
        });

        it('should set default discount to 0', async () => {
            const productData = generateMockProduct({ category: category._id });
            delete (productData as any).discount;

            const product = await Product.create(productData);
            expect(product.discount).toBe(0);
        });

        it('should validate sellingPrice is positive', async () => {
            const productData = generateMockProduct({
                category: category._id,
                sellingPrice: -100,
            });

            await expect(Product.create(productData)).rejects.toThrow();
        });

        it('should validate stock is non-negative', async () => {
            const productData = generateMockProduct({
                category: category._id,
                stock: -5,
            });

            await expect(Product.create(productData)).rejects.toThrow();
        });
    });

    describe('Reviews', () => {
        it('should initialize with empty reviews array', async () => {
            const productData = generateMockProduct({ category: category._id });
            const product = await Product.create(productData);

            expect(product.reviews).toEqual([]);
        });

        it('should allow adding reviews', async () => {
            const product = await Product.create(
                generateMockProduct({ category: category._id })
            );

            product.reviews.push({
                user: '507f1f77bcf86cd799439011',
                name: 'Test User',
                rating: 5,
                comment: 'Great product!',
            } as any);

            await product.save();

            const updatedProduct = await Product.findById(product._id);
            expect(updatedProduct?.reviews).toHaveLength(1);
            expect(updatedProduct?.reviews[0].rating).toBe(5);
        });
    });

    describe('Images', () => {
        it('should store multiple images', async () => {
            const productData = generateMockProduct({
                category: category._id,
                images: [
                    { public_id: 'img1', url: 'http://example.com/img1.jpg' },
                    { public_id: 'img2', url: 'http://example.com/img2.jpg' },
                    { public_id: 'img3', url: 'http://example.com/img3.jpg' },
                ],
            });

            const product = await Product.create(productData);
            expect(product.images).toHaveLength(3);
        });
    });

    describe('Slug Generation', () => {
        it('should have slug field', async () => {
            const product = await Product.create(
                generateMockProduct({
                    category: category._id,
                    name: 'Test Product Name',
                })
            );

            expect(product.slug).toBe('test-product-name');
        });
    });
});
