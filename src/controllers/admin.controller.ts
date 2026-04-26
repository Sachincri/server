import mongoose from "mongoose";
import { Response } from "express";
import { startOfDay, startOfMonth, subDays, subMonths, endOfDay, eachDayOfInterval, eachMonthOfInterval, format } from "date-fns";
import { AuthRequest } from "../types";
import asyncHandler from "../middleware/asyncHandler";
import ApiError from "../utils/apiError";
import ApiResponse from "../utils/response";

import User from "../models/User.model";
import Product from "../models/Product.model";
import Order from "../models/Order.model";
import { Cart } from "../models/Cart.model";
import Settings from "../models/Settings.model";

// Optional: Redis for caching
// import { redisClient } from "../config/redis";

type OrdersByStatusDoc = { _id: string; count: number };
type TopProductDoc = {
  _id: string;
  name: string;
  totalSold: number;
  totalRevenue: number;
};


export const getAdminDashboard = asyncHandler(
  async (_req: AuthRequest, res: Response) => {

    const now = new Date();
    const today = startOfDay(now);
    const yesterday = startOfDay(subDays(now, 1));
    const sevenDaysAgo = subDays(today, 6);
    const thirtyDaysAgo = subDays(today, 29);
    const ninetyDaysAgo = subDays(today, 89);
    const twelveMonthsAgo = subMonths(startOfMonth(today), 11);

    // Previous periods for comparison
    const prevSevenDaysAgo = subDays(sevenDaysAgo, 7);
    const prevThirtyDaysAgo = subDays(thirtyDaysAgo, 30);

    // Fetch tax settings
    const appSettings = await Settings.findOne().sort({ createdAt: -1 }).lean();
    const taxEnabled = appSettings?.taxEnabled ?? false;
    const gstRate = taxEnabled ? (appSettings?.gstRate ?? 18) / 100 : 0; // e.g. 0.18
    const taxRate = taxEnabled ? (appSettings?.taxRate ?? 0) / 100 : 0; // e.g. 0.05
    const combinedTaxRate = gstRate + taxRate;
    const gatewayFeeRate = taxEnabled ? (appSettings?.gatewayFeeRate ?? 2) / 100 : 0; // e.g. 0.02

    const [
      uncategorizedCount,
      paymentMethodAgg,
      refundsAgg,
      totalUsers,
      totalProducts,
      lowStockProducts,
      totalOrders,
      abandonedCarts,
      revenueAgg,
      ordersByStatus,
      todayMetrics,
      yesterdayMetrics,
      last7DaysMetrics,
      prev7DaysMetrics,
      last30DaysMetrics,
      prev30DaysMetrics,
      topProducts,
      customerMetrics,
      avgOrderValue,
      regionalSalesAgg,
      recentOrders,
      recentUsers,
      satisfactionAgg,
      productAlertsAgg
    ] = (await Promise.all([

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
      // Basic counts
      User.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Product.find({ isActive: true, stock: { $lt: 10 } })
        .limit(5)
        .select("name stock price"),
      Order.countDocuments(),
      Cart.countDocuments({ items: { $exists: true, $not: { $size: 0 } } }),

      // Total revenue (all time) + Deductions Breakdown
      Order.aggregate([
        { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            },
            grossSales: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: ["$$item.sellingPrice", "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            totalProfit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } },
            totalGrossSales: { $sum: "$grossSales" },
            totalCOGS: { $sum: "$orderCost" },
            totalDiscounts: { $sum: { $ifNull: ["$redeemCoins", 0] } },
            totalShipping: { $sum: { $ifNull: ["$shippingPrice", 0] } },
            totalTax: { $sum: { $multiply: ["$itemsPrice", combinedTaxRate] } },
            totalGatewayFee: { $sum: { $multiply: ["$totalPrice", gatewayFeeRate] } },
          }
        },
      ]),

      // Orders by status
      Order.aggregate([
        { $group: { _id: { $toLower: "$orderStatus" }, count: { $sum: 1 } } },
      ]),

      // Today's metrics
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: today, $lte: endOfDay(now) },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Yesterday's metrics
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: yesterday, $lt: today },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Last 7 days metrics
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: sevenDaysAgo, $lte: now },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Previous 7 days metrics (for comparison)
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: prevSevenDaysAgo, $lt: sevenDaysAgo },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Last 30 days metrics
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: thirtyDaysAgo, $lte: now },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Previous 30 days metrics
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: prevThirtyDaysAgo, $lt: thirtyDaysAgo },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
            profit: { $sum: { $subtract: [{ $subtract: [{ $subtract: ["$totalPrice", { $ifNull: ["$shippingPrice", 0] }] }, { $add: ["$orderCost", { $multiply: ["$itemsPrice", combinedTaxRate] }] }] }, { $multiply: ["$totalPrice", gatewayFeeRate] }] } }
          },
        },
      ]),

      // Top 10 selling products (last 30 days)
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        { $unwind: "$orderItems" },
        {
          $group: {
            _id: "$orderItems.product",
            totalSold: { $sum: "$orderItems.quantity" },
            totalRevenue: {
              $sum: { $multiply: ["$orderItems.quantity", { $ifNull: ["$orderItems.sellingPrice", 0] }] },
            },
            totalCost: {
              $sum: { $multiply: ["$orderItems.quantity", { $cond: { if: { $gt: ["$orderItems.actualPrice", 0] }, then: "$orderItems.actualPrice", else: { $multiply: ["$orderItems.sellingPrice", 0.6] } } }] }
            }
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: "$productInfo" },
        {
          $project: {
            _id: 1,
            name: "$productInfo.name",
            totalSold: 1,
            totalRevenue: 1,
            totalProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
            image: { $arrayElemAt: ["$productInfo.images.url", 0] },
          },
        },
      ]),

      // Customer Segmentation Analytics (last 30 days)
      Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: "$user",
            totalSpent: { $sum: "$totalPrice" },
            orderCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userDoc",
          },
        },
        { $unwind: "$userDoc" },
        {
          $addFields: {
            isNew: { $gte: ["$userDoc.createdAt", thirtyDaysAgo] },
          },
        },
        { $sort: { totalSpent: -1 } }, // High spenders first
      ]),

      // Average Order Value
      Order.aggregate([
        { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        {
          $group: {
            _id: null,
            avgOrderValue: { $avg: "$totalPrice" },
          },
        },
      ]),

      // Regional sales
      Order.aggregate([
        { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        {
          $group: {
            _id: "$shippingInfo.state",
            revenue: { $sum: "$totalPrice" },
            shippingCost: { $sum: "$shippingPrice" },
            orders: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 }
      ]),

      // Recent Activity
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name email"),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt"),

      // Customer Satisfaction rating (Weighted average of all rated products)
      Product.aggregate([
        { $match: { isActive: true, "ratings.count": { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalWeightedRating: { $sum: { $multiply: ["$ratings.average", "$ratings.count"] } },
            totalReviews: { $sum: "$ratings.count" }
          }
        },
        {
          $project: {
            avgRating: { 
              $cond: [
                { $gt: ["$totalReviews", 0] },
                { $divide: ["$totalWeightedRating", "$totalReviews"] },
                0
              ]
            }
          }
        }
      ]),

      // Product Quality Alerts: low-rated or high-refund products
      Order.aggregate([
        { $match: { orderStatus: { $in: ["Returned", "Refunded", "refunded"] } } },
        { $unwind: "$orderItems" },
        {
          $group: {
            _id: "$orderItems.product",
            refundCount: { $sum: 1 },
            productName: { $first: "$orderItems.name" },
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "prod"
          }
        },
        { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: { $ifNull: ["$prod.name", "$productName"] },
            rating: { $ifNull: ["$prod.ratings.average", 0] },
            refundCount: 1,
          }
        },
        { $match: { $or: [{ rating: { $lt: 3 } }, { refundCount: { $gte: 2 } }] } },
        { $sort: { refundCount: -1 } },
        { $limit: 5 }
      ])
    ]));

    // Process results
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;
    const totalProfit = revenueAgg.length > 0 ? revenueAgg[0].totalProfit : 0;

    const ordersStatusMap: Record<string, number> = {};
    (ordersByStatus as OrdersByStatusDoc[]).forEach((item) => {
      ordersStatusMap[item._id] = item.count;
    });

    const regionalSales = (regionalSalesAgg as any[] || []).map(r => ({
      region: r._id || "Unknown",
      revenue: r.revenue,
      shippingCost: r.shippingCost || 0,
      orders: r.orders
    }));

    // Calculate growth rates
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(2));
    };

    const todayData = todayMetrics[0] || { orders: 0, revenue: 0, profit: 0 };
    const yesterdayData = yesterdayMetrics[0] || { orders: 0, revenue: 0, profit: 0 };
    const last7Data = last7DaysMetrics[0] || { orders: 0, revenue: 0, profit: 0 };
    const prev7Data = prev7DaysMetrics[0] || { orders: 0, revenue: 0, profit: 0 };
    const last30Data = last30DaysMetrics[0] || { orders: 0, revenue: 0, profit: 0 };
    const prev30Data = prev30DaysMetrics[0] || { orders: 0, revenue: 0, profit: 0 };

    // Segment customers
    const activeShoppers = customerMetrics as any[];
    const vipThresholdIndex = Math.max(0, Math.floor(activeShoppers.length * 0.1) - 1);

    let newCust = 0;
    let returningCust = 0;
    let vipCust = 0;

    activeShoppers.forEach((shopper, index) => {
      // Top 10% by spend who bought something are VIP
      if (index <= vipThresholdIndex && shopper.totalSpent > 0 && activeShoppers.length >= 5) {
        vipCust++;
      } else if (shopper.isNew) {
        newCust++;
      } else {
        returningCust++;
      }
    });

    // ---- Time-series builders ----
    const buildDailySeries = async (from: Date, to: Date) => {
      // Main revenue pipeline (excludes cancelled/returned)
      const docs = (await Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            orders: { $sum: 1 },
            grossSales: { $sum: "$itemsPrice" },
            coinDiscount: { $sum: "$redeemCoins" },
            shippingFees: { $sum: "$shippingPrice" },
            revenue: { $sum: "$totalPrice" },
            cost: { $sum: "$orderCost" },
            customers: { $addToSet: "$user" },
          },
        },
        { $sort: { _id: 1 } },
      ])) as any[];

      // Refund pipeline: Returned/Refunded orders on the day they were cancelled/returned
      const refundDocs = (await Order.aggregate([
        {
          $match: {
            orderStatus: { $in: ["Returned", "Refunded", "refunded"] },
            updatedAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" },
            },
            refundAmount: { $sum: "$totalPrice" },
            refundCount: { $sum: 1 },
          },
        },
      ])) as any[];

      const dataMap = new Map(docs.map((d) => [d._id, d]));
      const refundMap = new Map(refundDocs.map((d) => [d._id, d]));
      const allDays = eachDayOfInterval({ start: from, end: to });

      return allDays.map((date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        const existing = dataMap.get(dateStr);
        const refund = refundMap.get(dateStr);
        const grossSales = existing ? existing.grossSales : 0;
        const coinDiscount = existing ? existing.coinDiscount : 0;
        const shippingFees = existing ? existing.shippingFees : 0;
        const revenue = existing ? existing.revenue : 0;
        const cost = existing ? existing.cost : 0;
        const refundAmount = refund ? refund.refundAmount : 0;
        const taxAmount = grossSales * combinedTaxRate;
        const gatewayFeeAmount = revenue * gatewayFeeRate;
        
        const netRevenue = revenue - refundAmount;
        const netProfit = netRevenue - shippingFees - cost - taxAmount - gatewayFeeAmount;
        
        return {
          date: dateStr,
          orders: existing ? existing.orders : 0,
          grossSales,
          coinDiscount,
          shippingFees,
          revenue: netRevenue,
          cost,
          tax: taxAmount,
          gatewayFee: gatewayFeeAmount,
          profit: netProfit,
          refunds: refundAmount,
          refundCount: refund ? refund.refundCount : 0,
          customers: existing ? existing.customers.length : 0,
        };
      });
    };

    const buildMonthlySeries = async (from: Date, to: Date) => {
      const docs = (await Order.aggregate([
        {
          $match: {
            orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] },
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $cond: { if: { $gt: ["$$item.actualPrice", 0] }, then: "$$item.actualPrice", else: { $multiply: ["$$item.sellingPrice", 0.6] } } }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" },
            },
            orders: { $sum: 1 },
            grossSales: { $sum: "$itemsPrice" },
            coinDiscount: { $sum: "$redeemCoins" },
            shippingFees: { $sum: "$shippingPrice" },
            revenue: { $sum: "$totalPrice" },
            cost: { $sum: "$orderCost" },
            customers: { $addToSet: "$user" },
          },
        },
        { $sort: { _id: 1 } },
      ])) as any[];

      const refundDocs = (await Order.aggregate([
        {
          $match: {
            orderStatus: { $in: ["Returned", "Refunded", "refunded"] },
            updatedAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$updatedAt" },
            },
            refundAmount: { $sum: "$totalPrice" },
            refundCount: { $sum: 1 },
          },
        },
      ])) as any[];

      const dataMap = new Map(docs.map((d) => [d._id, d]));
      const refundMap = new Map(refundDocs.map((d) => [d._id, d]));
      const allMonths = eachMonthOfInterval({ start: from, end: to });

      return allMonths.map((month) => {
        const monthStr = format(month, "yyyy-MM");
        const existing = dataMap.get(monthStr);
        const refund = refundMap.get(monthStr);
        const grossSales = existing ? existing.grossSales : 0;
        const coinDiscount = existing ? existing.coinDiscount : 0;
        const shippingFees = existing ? existing.shippingFees : 0;
        const revenue = existing ? existing.revenue : 0;
        const cost = existing ? existing.cost : 0;
        const refundAmount = refund ? refund.refundAmount : 0;
        const taxAmount = grossSales * combinedTaxRate;
        const gatewayFeeAmount = revenue * gatewayFeeRate;
        
        const netRevenue = revenue - refundAmount;
        const netProfit = netRevenue - shippingFees - cost - taxAmount - gatewayFeeAmount;
        
        return {
          month: monthStr,
          orders: existing ? existing.orders : 0,
          grossSales,
          coinDiscount,
          shippingFees,
          revenue: netRevenue,
          cost,
          tax: taxAmount,
          gatewayFee: gatewayFeeAmount,
          profit: netProfit,
          refunds: refundAmount,
          refundCount: refund ? refund.refundCount : 0,
          customers: existing ? existing.customers.length : 0,
        };
      });
    };

    // Fetch time series data
    const [last7DaysSeries, last30DaysSeries, last90DaysSeries, last12MonthsSeries] =
      await Promise.all([
        buildDailySeries(sevenDaysAgo, now),
        buildDailySeries(thirtyDaysAgo, now),
        buildDailySeries(ninetyDaysAgo, now),
        buildMonthlySeries(twelveMonthsAgo, now),
      ]);

    // Build response
    const response = {
      success: true,
      stats: {
        summary: {
          users: totalUsers,
          products: totalProducts,
          lowStockProducts: lowStockProducts.length, // Just the count for the summary
          lowStockDetails: lowStockProducts, // Actual product details
          orders: totalOrders,
          abandonedCarts: abandonedCarts,
          uncategorizedCount,
          paymentMethods: paymentMethodAgg,
          revenue: totalRevenue,
          profit: totalProfit,
          avgOrderValue: avgOrderValue[0]?.avgOrderValue || 0,
          conversionRate: (() => {
            // Unique sessions = registered users + anonymous cart intents
            const uniqueSessions = totalUsers + abandonedCarts;
            return uniqueSessions > 0 ? Number(((totalOrders / uniqueSessions) * 100).toFixed(2)) : 0;
          })(),
          customerSatisfaction: satisfactionAgg[0]?.avgRating || 4.5,
          taxSettings: {
            taxEnabled,
            gstRate: taxEnabled ? (appSettings?.gstRate ?? 18) : 0,
            taxRate: taxEnabled ? (appSettings?.taxRate ?? 0) : 0,
            gatewayFeeRate: taxEnabled ? (appSettings?.gatewayFeeRate ?? 2) : 0,
          },
        },
        realTime: {
          today: {
            orders: todayData.orders,
            revenue: todayData.revenue,
            profit: todayData.profit,
            ordersGrowth: calculateGrowth(todayData.orders, yesterdayData.orders),
            revenueGrowth: calculateGrowth(todayData.revenue, yesterdayData.revenue),
            profitGrowth: calculateGrowth(todayData.profit, yesterdayData.profit),
          },
          yesterday: {
            orders: yesterdayData.orders,
            revenue: yesterdayData.revenue,
          },
        },
        comparison: {
          last7Days: {
            orders: last7Data.orders,
            revenue: last7Data.revenue,
            profit: last7Data.profit,
            ordersGrowth: calculateGrowth(last7Data.orders, prev7Data.orders),
            revenueGrowth: calculateGrowth(last7Data.revenue, prev7Data.revenue),
            profitGrowth: calculateGrowth(last7Data.profit, prev7Data.profit),
          },
          last30Days: {
            orders: last30Data.orders,
            revenue: last30Data.revenue,
            profit: last30Data.profit,
            ordersGrowth: calculateGrowth(last30Data.orders, prev30Data.orders),
            revenueGrowth: calculateGrowth(last30Data.revenue, prev30Data.revenue),
            profitGrowth: calculateGrowth(last30Data.profit, prev30Data.profit),
          },
        },
        customers: {
          newCustomers: newCust,
          returningCustomers: returningCust,
          vipCustomers: vipCust,
        },
        ordersByStatus: ordersStatusMap,
        byRegion: regionalSales,
        topProducts: topProducts as TopProductDoc[],
        recentActivity: {
          orders: recentOrders,
          users: recentUsers,
        },
        charts: {
          last7Days: {
            from: sevenDaysAgo,
            to: today,
            series: last7DaysSeries,
          },
          last30Days: {
            from: thirtyDaysAgo,
            to: today,
            series: last30DaysSeries,
          },
          last90Days: {
            from: ninetyDaysAgo,
            to: today,
            series: last90DaysSeries,
          },
          last12Months: {
            from: twelveMonthsAgo,
            to: today,
            series: last12MonthsSeries,
          },
        },
        deductions: {
          grossSales: revenueAgg[0]?.totalGrossSales || 0,
          cogs: revenueAgg[0]?.totalCOGS || 0,
          totalTax: revenueAgg[0]?.totalTax || 0,
          totalGatewayFee: revenueAgg[0]?.totalGatewayFee || 0,
          totalDiscounts: revenueAgg[0]?.totalDiscounts || 0,
          totalShipping: revenueAgg[0]?.totalShipping || 0,
          totalRefunds: refundsAgg[0] ? refundsAgg[0].totalRefunds : 0,
          netProfit: totalProfit,
        },
        productAlerts: (productAlertsAgg as any[] || []).map((a: any) => ({
          productId: a.productId,
          productName: a.productName,
          rating: Number((a.rating || 0).toFixed(1)),
          refundCount: a.refundCount,
          alertType: a.rating < 3 && a.refundCount >= 2 ? 'critical' : a.rating < 3 ? 'low_rating' : 'high_refunds',
        })),
      },
    };


    res.status(200).json(ApiResponse.success(response.stats, "Dashboard data retrieved successfully"));
  }
);

// ---- Bonus: Get detailed product analytics ----
export const getProductAnalytics = asyncHandler(
  async (_req: AuthRequest, res: Response) => {

    const [totalProducts, outOfStock, lowStock, activeProducts, categoryBreakdown] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ stock: 0 }),
      Product.countDocuments({ stock: { $lt: 10, $gt: 0 } }),
      Product.countDocuments({ isActive: true }),
      Product.aggregate([
        {
          $match: {
            category: { $ne: null },
            $expr: { $eq: [{ $type: "$category" }, "objectId"] }
          }
        },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          }
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryDoc"
          }
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
        // Join with orders to get real revenue per category
        {
          $lookup: {
            from: "orders",
            let: { catId: "$_id" },
            pipeline: [
              { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
              { $unwind: "$orderItems" },
              {
                $lookup: {
                  from: "products",
                  localField: "orderItems.product",
                  foreignField: "_id",
                  as: "prod"
                }
              },
              { $unwind: "$prod" },
              {
                $match: {
                  $expr: { $eq: ["$prod.category", "$$catId"] }
                }
              },
              {
                $group: {
                  _id: null,
                  revenue: { $sum: { $multiply: ["$orderItems.sellingPrice", "$orderItems.quantity"] } },
                  cost: { $sum: { $multiply: [{ $cond: { if: { $gt: ["$orderItems.actualPrice", 0] }, then: "$orderItems.actualPrice", else: { $multiply: ["$orderItems.sellingPrice", 0.6] } } }, "$orderItems.quantity"] } }
                }
              }
            ],
            as: "orderStats"
          }
        },
        {
          $project: {
            _id: 1,
            count: 1,
            revenue: { $ifNull: [{ $arrayElemAt: ["$orderStats.revenue", 0] }, 0] },
            profit: {
              $subtract: [
                { $ifNull: [{ $arrayElemAt: ["$orderStats.revenue", 0] }, 0] },
                { $ifNull: [{ $arrayElemAt: ["$orderStats.cost", 0] }, 0] }
              ]
            },
            name: { $ifNull: ["$categoryDoc.name", "Uncategorized"] }
          }
        },
        { $sort: { revenue: -1 } }
      ])
    ]);

    const analytics = {
      totalProducts,
      outOfStock,
      lowStock,
      activeProducts,
      topCategories: categoryBreakdown.map(c => ({
        name: c.name,
        count: c.count,
        revenue: c.revenue,
        profit: c.profit || 0
      }))
    };

    res.status(200).json(ApiResponse.success(analytics, "Product analytics retrieved successfully"));
  }
);

// ---- Bonus: Get customer analytics ----
export const getCustomerAnalytics = asyncHandler(
  async (_req: AuthRequest, res: Response) => {

    const topCustomers = await Order.aggregate([
      { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
      {
        $group: {
          _id: "$user",
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      {
        $project: {
          _id: 1,
          name: "$userInfo.name",
          email: "$userInfo.email",
          totalOrders: 1,
          totalSpent: 1,
          avgOrderValue: 1,
        },
      },
    ]);

    res.status(200).json(ApiResponse.success(topCustomers, "Customer analytics retrieved successfully"));
  }
);

// ---- Admin User Management ----
export const getAllUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users = await User.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "user",
        as: "orders"
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        createdAt: 1,
        avatar: 1,
        phone: 1,
        rewardPoints: 1,
        ordersCount: { $size: "$orders" },
        purchasedAmount: { $sum: "$orders.totalPrice" },
        lastOrderDate: { $max: "$orders.createdAt" }
      }
    }
  ]);

  // Post-process to add tags
  const processedUsers = users.map(user => {
    const tags: string[] = [];
    const now = new Date();
    // Ensure createdAt is valid
    const createdDate = user.createdAt ? new Date(user.createdAt) : new Date();
    const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 3600 * 24);
    const lastOrder = user.lastOrderDate ? new Date(user.lastOrderDate) : null;
    const daysSinceLastOrder = lastOrder ? (now.getTime() - lastOrder.getTime()) / (1000 * 3600 * 24) : null;

    if (daysSinceCreation < 30) tags.push("New");
    if (user.ordersCount >= 3) tags.push("Frequent"); // Lowered threshold for testing
    if (user.purchasedAmount >= 5000) tags.push("High Value"); // Lowered threshold for testing

    // Inactive logic: No orders ever and old account, OR, hasn't ordered in 90 days
    let isActive = true;
    if (
      (user.ordersCount === 0 && daysSinceCreation > 90) ||
      (user.ordersCount > 0 && daysSinceLastOrder && daysSinceLastOrder > 90)
    ) {
      tags.push("Inactive");
      isActive = false;
    }



    return { ...user, tags, isActive };
  });



  res.status(200).json(ApiResponse.success({ users: processedUsers }, "Users retrieved successfully"));
});

export const getUserDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.params.id;

  const users = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(userId) } },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "user",
        as: "orders"
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        createdAt: 1,
        avatar: 1,
        phone: 1,
        rewardPoints: 1,
        ordersCount: { $size: "$orders" },
        purchasedAmount: { $sum: "$orders.totalPrice" },
        lastOrderDate: { $max: "$orders.createdAt" },
        orderHistory: {
          $map: {
            input: { $slice: ["$orders", 5] }, // last 5 orders
            as: "order",
            in: {
              id: "$$order._id",
              total: "$$order.totalPrice",
              status: "$$order.orderStatus",
              date: "$$order.createdAt"
            }
          }
        }
      }
    }
  ]);

  if (!users || users.length === 0) {
    throw ApiError.notFound("User not found");
  }

  const user = users[0];

  // Tag calculation (same as getAllUsers)
  const tags: string[] = [];
  const now = new Date();
  const createdDate = user.createdAt ? new Date(user.createdAt) : new Date();
  const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 3600 * 24);
  const lastOrder = user.lastOrderDate ? new Date(user.lastOrderDate) : null;
  const daysSinceLastOrder = lastOrder ? (now.getTime() - lastOrder.getTime()) / (1000 * 3600 * 24) : null;

  if (daysSinceCreation < 30) tags.push("New");
  if (user.ordersCount >= 3) tags.push("Frequent");
  if (user.purchasedAmount >= 5000) tags.push("High Value");

  if (
    (user.ordersCount === 0 && daysSinceCreation > 90) ||
    (user.ordersCount > 0 && daysSinceLastOrder && daysSinceLastOrder > 90)
  ) {
    tags.push("Inactive");
  }

  res.status(200).json(ApiResponse.success({ user: { ...user, tags } }, "User details retrieved successfully"));
});

export const updateUserRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  res.status(200).json(ApiResponse.success({ user }, "User role updated successfully"));
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  res.status(200).json(ApiResponse.success(null, "User deleted successfully"));
});
