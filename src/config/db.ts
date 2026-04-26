import mongoose from "mongoose";
import logger from "../utils/logger";

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string, {
      dbName: "eCom",

      // ── Connection Pool (scaled for 10K concurrent users) ──
      maxPoolSize: 50,              // Max connections per PM2 worker (4 workers × 50 = 200 total)
      minPoolSize: 10,              // Always keep 10 warm connections ready
      maxIdleTimeMS: 30000,         // Close idle connections after 30s

      // ── Timeouts ──
      socketTimeoutMS: 45000,       // 45s socket timeout (prevents hanging queries)
      serverSelectionTimeoutMS: 5000, // 5s to find a server
      connectTimeoutMS: 10000,      // 10s to establish initial connection
      heartbeatFrequencyMS: 10000,  // Check server health every 10s

      // ── Write Concern ──
      writeConcern: { w: 'majority', wtimeout: 5000 },
      retryWrites: true,
      retryReads: true,

      // ── Compression (reduces bandwidth ~60%) ──
      compressors: ['zlib'],
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host} (pool: 10-50)`);

    mongoose.connection.on("error", (err) => {
      logger.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("⚠️ MongoDB disconnected — attempting reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("✅ MongoDB reconnected successfully");
    });

    // ── Monitor pool usage in production ──
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const pool = mongoose.connection;
        if (pool.readyState === 1) {
          logger.debug(`MongoDB pool healthy — readyState: ${pool.readyState}`);
        }
      }, 60000); // Log every 60s
    }
  } catch (error) {
    logger.error("❌ Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

export default connectDB;
