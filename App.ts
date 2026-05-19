import express, { Express } from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './Databases/db';
import { connectRedis, getRedisHealth, startRedisAutoReconnect } from './config/redis';
import { errorHandler } from './Middlewares/errorHandler';
import mainRouter from './Routers/main.Routes';
// Import all models to ensure they're registered at startup
import './Databases/Models/index';

dotenv.config({ path: './config/.env' });

const app: Express = express();

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS origin is env-driven so ops can tighten it in production.
// If CORS_ORIGINS is unset we keep the legacy wildcard for backward
// compatibility, but warn — `credentials: true` + wildcard origin is
// ignored by browsers, so cookie-based auth will NOT work cross-origin
// until a specific origin list is configured.
const corsOriginsEnv = process.env.CORS_ORIGINS;
const corsOrigin: string[] = corsOriginsEnv
  ? corsOriginsEnv.split(',').map(o => o.trim()).filter(Boolean)
  : ['*'];

if (!corsOriginsEnv) {
  console.warn(
    "[cors] CORS_ORIGINS env var is not set — falling back to '*'. " +
    "Cross-origin cookies will NOT work until specific origins are configured."
  );
}

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-user-email', 'x-internal-api-key'],
  credentials: true,
}));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  const redisHealth = getRedisHealth();

  res.status(200).json({
    status: 'OK',
    service: 'Service1',
    redis: redisHealth,
    cacheMode: redisHealth.degraded || !redisHealth.enabled ? 'db_fallback' : 'redis_cache',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1', mainRouter);

app.use(errorHandler);

connectDB().catch(err => {
  console.error("Database initialization failed:", err);
});

try {
  console.log("Firebase Admin SDK initialized successfully");
} catch (err) {
  console.error("Firebase initialization failed:", err);
}

connectRedis().catch(err => {
  console.error("Redis initialization failed:", err);
});
startRedisAutoReconnect();

export default app;
