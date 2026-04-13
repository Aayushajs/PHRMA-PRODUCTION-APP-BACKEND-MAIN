/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Interface - TypeScript definitions for feature flags.    │
│  Defines structure for dynamic feature toggles with role-based access.│
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import RoleIndex from "../../Utils/Roles.enum";

export interface IFeatureFlag {
  _id?: mongoose.Types.ObjectId;
  key: string; // Unique identifier: "ONLINE_PAYMENT", "FEATURED_MEDICINES", "AI_CHATBOT"
  name: string; // Human-readable name: "Online Payment Gateway"
  description?: string; // Optional description of the feature
  enabled: boolean; // Global enable/disable switch
  allowedRoles: RoleIndex[]; // Roles that can access this feature: ["ADMIN", "CUSTOMER"]
  allowedUserIds: mongoose.Types.ObjectId[]; // Specific users who can access (whitelist)
  rolloutPercentage: number; // 0-100: Gradual rollout percentage (0 = nobody, 100 = everyone)
  createdAt?: Date;
  updatedAt?: Date;
}
