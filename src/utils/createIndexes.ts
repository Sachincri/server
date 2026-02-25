// Run this script once to create all necessary indexes for dashboard queries

import mongoose from "mongoose";
import User from "../models/User.model";
import Product from "../models/Product.model";
import Order from "../models/Order.model";

const createDashboardIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ecommerce");
    console.log("📊 Creating database indexes for dashboard optimization...");

    // ============================================
    // ORDER INDEXES (Most Critical)
    // ============================================

    // Compound index for time-series queries (most frequent)
    await Order.collection.createIndex(
      { createdAt: -1, status: 1 },
      { name: "idx_created_status" }
    );
    console.log("✅ Created: Order.createdAt + status index");

    // Index for status filtering
    await Order.collection.createIndex(
      { status: 1 },
      { name: "idx_status" }
    );
    console.log("✅ Created: Order.status index");

    // Index for user-specific queries
    await Order.collection.createIndex(
      { user: 1, createdAt: -1 },
      { name: "idx_user_created" }
    );
    console.log("✅ Created: Order.user + createdAt index");

    // Index for revenue aggregations
    await Order.collection.createIndex(
      { status: 1, totalAmount: -1 },
      { name: "idx_status_amount" }
    );
    console.log("✅ Created: Order.status + totalAmount index");

    // Index for product sales analysis (items array)
    await Order.collection.createIndex(
      { "items.product": 1, createdAt: -1 },
      { name: "idx_items_product" }
    );
    console.log("✅ Created: Order.items.product index");

    // ============================================
    // PRODUCT INDEXES
    // ============================================

    // Compound index for active products with stock
    await Product.collection.createIndex(
      { isActive: 1, stock: 1 },
      { name: "idx_active_stock" }
    );
    console.log("✅ Created: Product.isActive + stock index");

    // Index for product categories
    await Product.collection.createIndex(
      { category: 1, isActive: 1 },
      { name: "idx_category_active" }
    );
    console.log("✅ Created: Product.category + isActive index");

    // Index for price sorting
    await Product.collection.createIndex(
      { price: 1, isActive: 1 },
      { name: "idx_price_active" }
    );
    console.log("✅ Created: Product.price + isActive index");

    // ============================================
    // USER INDEXES
    // ============================================

    // Index for user registration date
    await User.collection.createIndex(
      { createdAt: -1 },
      { name: "idx_created" }
    );
    console.log("✅ Created: User.createdAt index");

    // Index for admin users
    await User.collection.createIndex(
      { isAdmin: 1 },
      { name: "idx_admin" }
    );
    console.log("✅ Created: User.isAdmin index");

    // Index for active users
    await User.collection.createIndex(
      { isActive: 1, createdAt: -1 },
      { name: "idx_active_created" }
    );
    console.log("✅ Created: User.isActive + createdAt index");

    // ============================================
    // VERIFY INDEXES
    // ============================================

    console.log("\n📋 Verifying indexes...");

    const orderIndexes = await Order.collection.indexes();
    const productIndexes = await Product.collection.indexes();
    const userIndexes = await User.collection.indexes();

    console.log("\n📦 Order Indexes:", orderIndexes.map(i => i.name));
    console.log("📦 Product Indexes:", productIndexes.map(i => i.name));
    console.log("📦 User Indexes:", userIndexes.map(i => i.name));

    console.log("\n✅ All indexes created successfully!");

  } catch (error) {
    console.error("❌ Error creating indexes:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Database disconnected");
  }
};

// Run the script ONLY if executed directly
if (require.main === module) {
  createDashboardIndexes();
}

// ============================================
// MONGOOSE MODEL SCHEMA INDEXES
// ============================================
// Add these to your model files directly

/* 
// In Order.model.ts
orderSchema.index({ createdAt: -1, status: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ "items.product": 1, createdAt: -1 });

// In Product.model.ts
productSchema.index({ isActive: 1, stock: 1 });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1, isActive: 1 });

// In User.model.ts
userSchema.index({ createdAt: -1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ isActive: 1, createdAt: -1 });
*/

// ============================================
// PERFORMANCE MONITORING
// ============================================

export const analyzeQueryPerformance = async () => {
  const mongoose = require("mongoose");

  // Enable query profiling
  mongoose.set("debug", (collectionName: string, method: string, query: any, _doc: any) => {
    console.log(`${collectionName}.${method}`, JSON.stringify(query));
  });

  // Check slow queries
  const admin = mongoose.connection.db.admin();
  const result = await admin.command({ profile: 2, slowms: 100 });
  console.log("Query profiling enabled:", result);
};

// ============================================
// INDEX USAGE STATISTICS
// ============================================

export const getIndexStats = async () => {
  try {
    const orderStats = await Order.collection.aggregate([
      { $indexStats: {} }
    ]).toArray();

    const productStats = await Product.collection.aggregate([
      { $indexStats: {} }
    ]).toArray();

    const userStats = await User.collection.aggregate([
      { $indexStats: {} }
    ]).toArray();

    console.log("\n📊 Index Usage Statistics:");
    console.log("\nOrders:", JSON.stringify(orderStats, null, 2));
    console.log("\nProducts:", JSON.stringify(productStats, null, 2));
    console.log("\nUsers:", JSON.stringify(userStats, null, 2));

    return { orderStats, productStats, userStats };
  } catch (error) {
    console.error("Error getting index stats:", error);
    return null;
  }
};

// ============================================
// EXPLAIN QUERY PLANS
// ============================================

export const explainDashboardQuery = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Explain a typical dashboard query
  const explanation = await Order.collection
    .find({
      status: { $ne: "cancelled" },
      createdAt: { $gte: thirtyDaysAgo }
    })
    .explain("executionStats");

  console.log("\n📊 Query Execution Plan:");
  console.log(JSON.stringify(explanation, null, 2));

  // Check if index is being used
  const usingIndex = explanation.executionStats.executionStages.inputStage?.indexName;
  console.log(`\n${usingIndex ? '✅' : '❌'} Using index: ${usingIndex || 'NONE (Collection scan!)'}`);

  return explanation;
};