import express, { Response, Request, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";


import hpp from "hpp";
import cookieParser from "cookie-parser";
import errorHandler from "./middleware/error.middleware";

// Import routes
import homeRoutes from "./routes/home.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import productRoutes from "./routes/product.routes";
import orderRoutes from "./routes/order.routes";
import adminRoutes from "./routes/admin.routes";
import cartRoutes from "./routes/cart.routes";
import paymentRoutes from "./routes/payment.routes";
import addressRoutes from "./routes/address.routes";
import supportRoutes from "./routes/support.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappRoutes from "./routes/whatsapp.routes";
import campaignRoutes from "./routes/campaign.routes";
import seoRoutes from "./routes/seo.routes";
import couponRoutes from "./routes/coupon.routes";
import analyticsRoutes from "./routes/analytics.routes";
import notificationRoutes from "./routes/notification.routes";
import categoryRoutes from "./routes/category.routes";
import brandRoutes from "./routes/brand.routes";
import { sanitizeRequest } from "./middleware/asyncHandler";
import compression from "compression";
import morgan from "morgan";
import { apiLimiter } from "./middleware/rateLimiter.middleware";
import { isRedisAvailable, isRedisConfigured } from "./config/redis";


const app = express();

// Security Middleware
app.use(helmet());

// CORS
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body parser — 10MB limit (was 50MB; prevents memory spikes at scale)
app.use(express.json({
  limit: "10mb",
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(sanitizeRequest);


app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  // Use "tiny" format in production for lower logging overhead at scale
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
  app.use("/api", apiLimiter); // Apply global rate limiter to all API routes
}

app.use(hpp());


// Health check — reports system status for load balancer probes
app.get("/favicon.ico", (_req: Request, _res: Response) => _res.status(204).end());
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is healthy",
    uptime: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    redis: {
      configured: isRedisConfigured(),
      available: isRedisAvailable(),
    },
  });
});

// API routes
app.use("/api/v1/home", homeRoutes)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/brands", brandRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/whatsapp", whatsappRoutes);
app.use("/api/v1/campaigns", campaignRoutes);
app.use("/api/v1/seo", seoRoutes);
app.use("/api/v1/coupons", couponRoutes);
app.use("/api/v1/analytics", analyticsRoutes);


// 404 handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  const err: any = new Error(`Can't find ${req.originalUrl} on this server!`);
  err.statusCode = 404;
  err.status = "fail";
  next(err);
});

// Global error handler
app.use(errorHandler);

export default app;
