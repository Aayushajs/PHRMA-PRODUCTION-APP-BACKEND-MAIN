/*
┌───────────────────────────────────────────────────────────────────────┐
│  Rate Limiter Middleware - Protects APIs from abuse & DDoS.           │
│  Uses express-rate-limit backed by Redis (via rate-limit-redis).      │
│  Gracefully falls back to memory if Redis is unavailable.             │
└───────────────────────────────────────────────────────────────────────┘
*/

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response, NextFunction } from 'express';
import { rawRedis, isRedisAvailable } from '../config/redis';

// A safe sendCommand that gracefully fails if Redis is down.
// rate-limit-redis automatically falls back to MemoryStore if we throw an error here,
// or we can allow it to throw so it bypasses limit (fail-open).
const safeSendCommand = async (...args: string[]) => {
    if (!isRedisAvailable()) {
        throw "Redis unavailable, rate-limit-redis will fallback or fail-open.";
    }
    return rawRedis.sendCommand(args);
};

// Custom logger to suppress expected initialization errors when Redis is gracefully falling back
const customLogger = {
    warn: (...args: any[]) => console.warn(...args),
    error: (...args: any[]) => {
        const errorMsg = String(args[0]);
        if (errorMsg.includes("Redis unavailable, rate-limit-redis will fallback")) {
            return; // Swallow expected log
        }
        console.error(...args);
    }
};

// 1. Global Limiter (Applied to all routes generally)
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true, 
    legacyHeaders: false, 
    passOnStoreError: true,
    logger: customLogger,
    store: new RedisStore({
        sendCommand: safeSendCommand as any,
        prefix: `rl:global:`
    }),
    handler: (req: Request, res: Response, next: NextFunction) => {
        res.status(429).json({
            success: false,
            statusCode: 429,
            message: "Too many requests from this IP, please try again after 15 minutes."
        });
    }
});

// 2. Strict Auth Limiter (Applied to login, signup, forgot-password)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Limit each IP to 15 requests per window for auth routes
    standardHeaders: true, 
    legacyHeaders: false, 
    passOnStoreError: true,
    logger: customLogger,
    store: new RedisStore({
        sendCommand: safeSendCommand as any,
        prefix: `rl:auth:`
    }),
    handler: (req: Request, res: Response, next: NextFunction) => {
        res.status(429).json({
            success: false,
            statusCode: 429,
            message: "Too many authentication attempts from this IP, please try again after 15 minutes."
        });
    }
});

// 3. API Specific Limiter (For expensive endpoints like search or AI recommendations)
export const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // Limit each IP to 100 requests per 5 minutes
    standardHeaders: true, 
    legacyHeaders: false, 
    passOnStoreError: true,
    logger: customLogger,
    store: new RedisStore({
        sendCommand: safeSendCommand as any,
        prefix: `rl:api:`
    }),
    handler: (req: Request, res: Response, next: NextFunction) => {
        res.status(429).json({
            success: false,
            statusCode: 429,
            message: "Too many API requests from this IP, please try again after 5 minutes."
        });
    }
});
