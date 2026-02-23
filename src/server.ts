// src/server.ts
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import app from './app';
import connectDB from './config/db';
import logger from './utils/logger';
import { runCoinExpiryJob } from './cron/coinExpiry';
import { initializeSocket } from './config/socket';


const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

// Connect to database
connectDB().then(() => {
  runCoinExpiryJob();
});

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

const server = httpServer.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`Socket.IO enabled on port ${PORT}`);
});

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
