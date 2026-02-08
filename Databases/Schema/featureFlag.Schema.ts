/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Schema - MongoDB schema for feature flag system.         │
│  Supports role-based access, user whitelist, and gradual rollout.     │
│  MongoDB = Source of Truth. Redis = Cache Layer.                      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Schema, Document } from "mongoose";
import { IFeatureFlag } from "../Entities/featureFlag.Interface";
import RoleIndex from "../../Utils/Roles.enum";

export const featureFlagSchema = new Schema<IFeatureFlag & Document>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      description: "Unique feature identifier (e.g., ONLINE_PAYMENT, AI_CHATBOT)",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      description: "Human-readable feature name",
    },
    description: {
      type: String,
      trim: true,
      default: "",
      description: "Optional feature description",
    },
    enabled: {
      type: Boolean,
      required: true,
      default: false,
      description: "Global feature toggle (master switch)",
    },
    allowedRoles: {
      type: [String],
      enum: Object.values(RoleIndex),
      default: [],
      description: "Roles that can access this feature",
    },
    allowedUserIds: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
      description: "Specific users allowed access (whitelist)",
    },
    rolloutPercentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
      description: "Gradual rollout percentage (0-100)",
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Compound index for efficient queries
featureFlagSchema.index({ enabled: 1, key: 1 });
featureFlagSchema.index({ allowedRoles: 1 });
