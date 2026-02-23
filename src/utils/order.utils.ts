/**
 * Utility for order-related calculations to ensure consistency 
 * across payment and order controllers.
 */

export interface OrderTotals {
    itemsPrice: number;
    shippingCharges: number;
    totalAmount: number;
}

/**
 * Calculates the final order amount based on cart total
 * @param cartTotal The sum of all items in cart
 * @returns OrderTotals object
 */
export const calculateOrderTotals = (cartTotal: number): OrderTotals => {
    const itemsPrice = cartTotal;
    // Free shipping for orders above 500
    const shippingCharges = itemsPrice > 500 ? 0 : 40;
    // Fixed platform fee
    const totalAmount = itemsPrice + shippingCharges;

    return {
        itemsPrice,
        shippingCharges,
        totalAmount
    };
};
