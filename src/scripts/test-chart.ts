import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';

dotenv.config();

const uri = process.env.DATABASE_URI || process.env.MONGODB_URI;

mongoose.connect(uri as string, { dbName: "eCom" }).then(async () => {
    const Order = mongoose.model('Order', new mongoose.Schema({}, { collection: 'orders', strict: false }));
    const now = new Date();
    const today = startOfDay(now);
    const sevenDaysAgo = subDays(today, 6);

    const docs = await Order.aggregate([
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
            },
            orderRevenue: {
              $sum: {
                $map: {
                  input: "$orderItems",
                  as: "item",
                  in: { $multiply: [{ $ifNull: ["$$item.sellingPrice", 0] }, "$$item.quantity"] }
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
            revenue: { $sum: "$orderRevenue" },
            cost: { $sum: "$orderCost" },
            customers: { $addToSet: "$user" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dataMap = new Map(docs.map((d) => [d._id, d]));
      const allDays = eachDayOfInterval({ start: sevenDaysAgo, end: now });

      const last7DaysSeries = allDays.map((date) => {
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

    console.log("last7DaysSeries:");
    console.log(JSON.stringify(last7DaysSeries, null, 2));
    
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
