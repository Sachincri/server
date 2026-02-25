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

    // ---- Core Metrics with Comparison ----
    const [
      totalUsers,
      totalProducts,
      lowStockProducts, // This is now an array of products
      totalOrders,
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
      satisfactionAgg
    ] = await Promise.all([
      // Basic counts
      User.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Product.find({ isActive: true, stock: { $lt: 10 } })
        .limit(5)
        .select("name stock price"),
      Order.countDocuments(),

      // Total revenue (all time)
      Order.aggregate([
        { $match: { orderStatus: { $nin: ["Cancelled", "Returned", "Refunded", "refunded"] } } },
        {
          $addFields: {
            orderCost: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            totalProfit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            profit: { $sum: { $subtract: ["$totalPrice", "$orderCost"] } }
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
              $sum: { $multiply: ["$orderItems.quantity", { $ifNull: ["$orderItems.actualPrice", 0] }] }
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

      // New vs Returning Customers (last 30 days)
      User.aggregate([
        {
          $facet: {
            newCustomers: [
              { $match: { createdAt: { $gte: thirtyDaysAgo } } },
              { $count: "count" },
            ],
            returningCustomers: [
              { $match: { createdAt: { $lt: thirtyDaysAgo } } },
              {
                $lookup: {
                  from: "orders",
                  localField: "_id",
                  foreignField: "user",
                  as: "recentOrders",
                },
              },
              {
                $match: {
                  "recentOrders.createdAt": { $gte: thirtyDaysAgo },
                },
              },
              { $count: "count" },
            ],
          },
        },
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

      // Customer Satisfaction rating (Average of all product ratings)
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, avgRating: { $avg: "$ratings.average" } } }
      ])
    ]);

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

    const customerData = customerMetrics[0] || {
      newCustomers: [{ count: 0 }],
      returningCustomers: [{ count: 0 }],
    };

    // ---- Time-series builders ----
    const buildDailySeries = async (from: Date, to: Date) => {
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            revenue: { $sum: "$totalPrice" },
            cost: { $sum: "$orderCost" },
            customers: { $addToSet: "$user" },
          },
        },
        { $sort: { _id: 1 } },
      ])) as any[];

      const dataMap = new Map(docs.map((d) => [d._id, d]));
      const allDays = eachDayOfInterval({ start: from, end: to });

      return allDays.map((date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        const existing = dataMap.get(dateStr);
        const revenue = existing ? existing.revenue : 0;
        const cost = existing ? existing.cost : 0;
        return {
          date: dateStr,
          orders: existing ? existing.orders : 0,
          revenue: revenue,
          profit: revenue - cost,
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
                  in: { $multiply: [{ $ifNull: ["$$item.actualPrice", 0] }, "$$item.quantity"] }
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
            revenue: { $sum: "$totalPrice" },
            cost: { $sum: "$orderCost" },
            customers: { $addToSet: "$user" },
          },
        },
        { $sort: { _id: 1 } },
      ])) as any[];

      const dataMap = new Map(docs.map((d) => [d._id, d]));
      const allMonths = eachMonthOfInterval({ start: from, end: to });

      return allMonths.map((month) => {
        const monthStr = format(month, "yyyy-MM");
        const existing = dataMap.get(monthStr);
        const revenue = existing ? existing.revenue : 0;
        const cost = existing ? existing.cost : 0;
        return {
          month: monthStr,
          orders: existing ? existing.orders : 0,
          revenue: revenue,
          profit: revenue - cost,
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
          revenue: totalRevenue,
          profit: totalProfit,
          avgOrderValue: avgOrderValue[0]?.avgOrderValue || 0,
          conversionRate: totalUsers > 0 ? Number(((totalOrders / totalUsers) * 100).toFixed(2)) : 0,
          customerSatisfaction: satisfactionAgg[0]?.avgRating || 4.5,
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
          newCustomers: customerData.newCustomers[0]?.count || 0,
          returningCustomers: customerData.returningCustomers[0]?.count || 0,
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
                  cost: { $sum: { $multiply: [{ $ifNull: ["$orderItems.actualPrice", 0] }, "$orderItems.quantity"] } }
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
        revenue: c.revenue
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
