import { toSlug, toStringArray } from '../../../src/utils/helper';

describe('Helper Utilities', () => {
    describe('toSlug', () => {
        it('should convert string to lowercase slug', () => {
            expect(toSlug('Hello World')).toBe('hello-world');
        });

        it('should handle multiple spaces', () => {
            expect(toSlug('Hello   World   Test')).toBe('hello-world-test');
        });

        it('should handle special characters', () => {
            expect(toSlug('Hello@World#Test!')).toBe('hello-world-test');
        });

        it('should handle leading and trailing spaces', () => {
            expect(toSlug('  Hello World  ')).toBe('hello-world');
        });

        it('should handle numbers', () => {
            expect(toSlug('Product 123')).toBe('product-123');
        });

        it('should handle empty string', () => {
            expect(toSlug('')).toBe('');
        });

        it('should handle unicode characters', () => {
            expect(toSlug('Café Münchën')).toBe('café-münchën');
        });
    });

    describe('toStringArray', () => {
        it('should return array as is if already an array', () => {
            const input = ['item1', 'item2', 'item3'];
            expect(toStringArray(input)).toEqual(input);
        });

        it('should convert comma-separated string to array', () => {
            expect(toStringArray('item1,item2,item3')).toEqual(['item1', 'item2', 'item3']);
        });

        it('should trim whitespace from items', () => {
            expect(toStringArray('item1 , item2 , item3')).toEqual(['item1', 'item2', 'item3']);
        });

        it('should handle single item string', () => {
            expect(toStringArray('single-item')).toEqual(['single-item']);
        });

        it('should return empty array for empty string', () => {
            expect(toStringArray('')).toEqual([]);
        });

        it('should filter out empty items', () => {
            expect(toStringArray('item1,,item2,,,item3')).toEqual(['item1', 'item2', 'item3']);
        });

        it('should handle undefined', () => {
            expect(toStringArray(undefined)).toEqual([]);
        });

        it('should handle null', () => {
            expect(toStringArray(null)).toEqual([]);
        });
    });
});
