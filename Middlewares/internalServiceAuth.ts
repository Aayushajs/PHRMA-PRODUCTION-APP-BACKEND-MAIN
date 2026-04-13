/*
┌───────────────────────────────────────────────────────────────────────┐
│  Internal Service Authentication Middleware                           │
│  Validates API keys for inter-service communication                   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../Utils/ApiError';

/**
 * Middleware to authenticate internal service-to-service API calls
 * Checks for x-internal-api-key header and validates against environment variable
 */
export const internalServiceAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_API_KEY;
    // console.log("API key : ", apiKey);
    // console.log("Expected key : ", expectedKey);

    // Check if API key is configured
    if (!expectedKey) {
      console.error('⚠️  INTERNAL_SERVICE_API_KEY not configured in environment');
      throw new ApiError(500, 'Internal service authentication not configured');
    }

    // Validate API key
    if (!apiKey) {
      throw new ApiError(401, 'Unauthorized: Missing internal service API key');
    }

    if (apiKey !== expectedKey) {
      console.warn('⚠️  Invalid internal service API key attempt');
      throw new ApiError(401, 'Unauthorized: Invalid internal service API key');
    }

    // Authentication successful
    next();
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};
