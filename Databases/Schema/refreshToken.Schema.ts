/*
┌───────────────────────────────────────────────────────────────────────┐
│  Refresh Token Schema — Persistent store for rotating refresh tokens. │
│                                                                       │
│  Stores SHA-256 hashes (never plaintext). TTL index on expiresAt      │
│  enables Mongo to auto-purge expired rows. `revokedAt` + `replacedBy- │
│  Hash` track rotation chain so we can detect reuse (token theft).     │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose, { Schema, Document } from "mongoose";
import { IRefreshToken } from "../Entities/refreshToken.Interface";

export const refreshTokenSchema = new Schema<IRefreshToken & Document>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index — Mongo auto-removes documents when expiresAt passes.
      expires: 0,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedByHash: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound index for fast "active tokens for user" lookups.
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
