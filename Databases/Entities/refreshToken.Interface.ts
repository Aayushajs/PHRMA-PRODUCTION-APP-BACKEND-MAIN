/*
┌───────────────────────────────────────────────────────────────────────┐
│  Refresh Token Interface - Type definitions for refresh tokens.       │
│  Stores opaque rotation-aware refresh tokens with reuse detection.    │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";

export interface IRefreshToken {
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    revokedAt?: Date | null;
    replacedByHash?: string | null;
    userAgent?: string;
    ipAddress?: string;
    createdAt?: Date;
    updatedAt?: Date;
}
