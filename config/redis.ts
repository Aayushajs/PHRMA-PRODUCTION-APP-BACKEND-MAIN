/*
┌───────────────────────────────────────────────────────────────────────┐
│  Redis Config - Connection setup for Redis caching.                   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 5) return false;
      return Math.min(retries * 1000, 5000);
    },
  },
});

let isRedisConnected = false;

redis.on("error", (err) => {
  console.error("Redis Client Error:", err);
  isRedisConnected = false;
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
  isRedisConnected = true;
});

redis.on("end", () => {
  console.warn("Redis connection closed");
  isRedisConnected = false;
});

export const connectRedis = async () => {
  try {
    if (!redis.isOpen) {
      await redis.connect();
      isRedisConnected = true;
    }
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
    isRedisConnected = false;
  }
};

export const isRedisAvailable = () => isRedisConnected && redis.isOpen;

connectRedis();
