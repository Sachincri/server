const fs = require('fs');
const file = 'c:/serverts/server/src/controllers/admin.controller.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace orderCost inside $map for actualPrice (handling 0 or null fallback to 60% of sellingPrice)
content = content.replace(/in: \{ \$multiply: \[\{ \$ifNull: \[\"\$\$item\.actualPrice\", 0\] \}, \"\$\$item\.quantity\"\] \}/g, 'in: { $multiply: [{ $cond: { if: { $gt: [\"$$item.actualPrice\", 0] }, then: \"$$item.actualPrice\", else: { $multiply: [\"$$item.sellingPrice\", 0.6] } } }, \"$$item.quantity\"] }');

// Replace totalCost in topProducts ($orderItems.actualPrice)
content = content.replace(/\{ \$ifNull: \[\"\$orderItems\.actualPrice\", 0\] \}/g, '{ $cond: { if: { $gt: [\"$orderItems.actualPrice\", 0] }, then: \"$orderItems.actualPrice\", else: { $multiply: [\"$orderItems.sellingPrice\", 0.6] } } }');

// Replace totalProfit calculation everywhere
content = content.replace(/totalProfit: \{ \$sum: \{ \$subtract: \[\"\$totalPrice\", \"\$orderCost\"\] \} \}/g, 'totalProfit: { $sum: { $subtract: [{ $subtract: [\"$totalPrice\", { $ifNull: [\"$shippingPrice\", 0] }] }, { $add: [\"$orderCost\", { $multiply: [\"$itemsPrice\", 0.18] }] }] } }');

// Replace profit calculation for sub periods
content = content.replace(/profit: \{ \$sum: \{ \$subtract: \[\"\$totalPrice\", \"\$orderCost\"\] \} \}/g, 'profit: { $sum: { $subtract: [{ $subtract: [\"$totalPrice\", { $ifNull: [\"$shippingPrice\", 0] }] }, { $add: [\"$orderCost\", { $multiply: [\"$itemsPrice\", 0.18] }] }] } }');

// Add totalTax to deductions
content = content.replace(/totalShipping: \{ \$sum: \{ \$ifNull: \[\"\$shippingPrice\", 0\] \} \},/g, 'totalShipping: { $sum: { $ifNull: [\"$shippingPrice\", 0] } },\n            totalTax: { $sum: { $multiply: [\"$itemsPrice\", 0.18] } },');

// We need to inject the uncat, payment method, and refunds aggregations to Promise.all array
const injectionIndex = content.indexOf('User.countDocuments()');
if (injectionIndex > -1) {
    const uncatQuery = `
      // Uncategorized products
      Product.countDocuments({
        $or: [
          { category: null },
          { category: { $exists: false } }
        ]
      }),
      // Payment method breakdown
      Order.aggregate([
        { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        { 
          $group: {
            _id: "$paymentInfo.method",
            count: { $sum: 1 },
            amount: { $sum: "$totalPrice" }
          }
        }
      ]),
      // Refunds aggregation
      Order.aggregate([
        { $match: { orderStatus: { $in: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        { 
          $group: { 
            _id: null, 
            totalRefunds: { $sum: "$totalPrice" } 
          }
        }
      ]),
`;
    // Find the right place to replace const destructuring
    content = content.replace('      productAlertsAgg', '      productAlertsAgg,\n      uncategorizedCount,\n      paymentMethodAgg,\n      refundsAgg');
    content = content.replace('      // Basic counts', uncatQuery + '      // Basic counts');
}

// Add deductions new fields and total refunds to the response
content = content.replace(/totalRefunds: 0, \/\/ Refunds are already subtracted from revenue in chart series/, 'totalRefunds: refundsAgg[0] ? refundsAgg[0].totalRefunds : 0,');
content = content.replace(/totalTax: { \$sum:/g, 'totalTax: { $sum:'); // just a check
content = content.replace(/cogs: revenueAgg\[0\]\?\.totalCOGS \|\| 0,/g, 'cogs: revenueAgg[0]?.totalCOGS || 0,\n          totalTax: revenueAgg[0]?.totalTax || 0,');

// Add uncategorized and payment method to summary
content = content.replace(/abandonedCarts: abandonedCarts,/g, 'abandonedCarts: abandonedCarts,\n          uncategorizedCount,\n          paymentMethods: paymentMethodAgg,');

fs.writeFileSync(file, content);
console.log('Update Complete');
