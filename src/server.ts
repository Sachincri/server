// src/server.ts
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import app from './app';
import connectDB from './config/db';
import logger from './utils/logger';
import { runCoinExpiryJob } from './cron/coinExpiry';
import { initializeSocket } from './config/socket';
import { ensureRedisConnected } from './config/redis';


const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

// Initialize Redis early. The app continues if Redis is unavailable.
ensureRedisConnected().catch((err) => {
  logger.warn(`Redis warmup failed: ${err.message}`);
});

// Connect to database
connectDB().then(() => {
  runCoinExpiryJob();
});

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO (with Redis adapter if available)
initializeSocket(httpServer);

const server = httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`📡 Socket.IO enabled on port ${PORT}`);
  logger.info(`⚡ Optimized for 10K concurrent users`);
});

// ── Increase connection limits for high traffic ──
server.maxConnections = 15000;
server.keepAliveTimeout = 65000;     // 65s — slightly above typical LB timeout (60s)
server.headersTimeout = 66000;       // Must be > keepAliveTimeout

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: any) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', err);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated!');
  });
});
