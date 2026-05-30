/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines user accounts for e-pharmacy platform with authentication,   │
│  profile data, and role-based access. Stores personal details,        │
│  address, wishlist, and timestamps. Supports both customers and       │
│  administrators through role enumeration.                             │
└───────────────────────────────────────────────────────────────────────┘
*/

import RoleIndex from "../../Utils/auth/Roles.enum";
import { Iuser } from "../Entities/user.Interface";
import { Schema, Document } from "mongoose";

export const userSchema = new Schema<Iuser & Document>(
  {
    name: {
      type: String,
      required: function (this: any) {
        // Users created by Service 2 (store owners) use `userName` instead of
        // `name` on the shared `users` collection. Don't force `name` when
        // `userName` is present — prevents cross-service schema drift errors.
        return !this.userName;
      },
      trim: true,
    },
    // Mirror of Service 2's field name on the shared collection (tolerant read/write).
    userName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: function (this: any) {
        // ✔ password only required for local users
        return this.provider === "local";
      },
    },
    phone: {
      type: String,
      sparse: true, // Allows null/empty for Google sign-in users
      default: "",
    },
    age: {
      type: Number,
    },
    dob: {
      type: Date,
    },
    fcmToken: {
      type: String,
    },
    lastLogin: {
      type: Date,
    },
    itemsPurchased: {
      type: [Schema.Types.ObjectId],
      ref: "Item",
      default: [],
    },
    viewedItems: {
      type: [Schema.Types.ObjectId],
      ref: "Item",
      default: [],
    },
    viewedCategories: {
      type: [Schema.Types.ObjectId],
      ref: "Category",
      default: [],
    },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
      country: { type: String },
      location: {
        longitude: {
          type: Number,
          min: -180,
          max: 180,
        },
        latitude: {
          type: Number,
          min: -90,
          max: 90,
        },
      },
    },
    role: {
      type: String,
      required: true,
      // Aligned with Service 2 so store-owner/staff/pharmacist users on the
      // shared collection pass validation (was ["ADMIN","CUSTOMER"] → drift).
      enum: ["ADMIN", "CUSTOMER", "OWNER", "STAFF", "PHARMACIST", "UNKNOWN"],
      default: RoleIndex.UNKNOWN,
    },
    // Shared field (owned by Service 2 store/KYC flow). Defined here so Service 1
    // can READ it to enforce the OWNER/PHARMACIST login KYC gate. Optional —
    // customers don't have/need it.
    kycStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
    },
    // Shared account-block flag (set by Service 2 admin). Read here to block
    // login of blocked accounts (tokens are shared across services).
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedReason: {
      type: String,
    },
    ProfileImage: {
      type: [String],
      default: [],
      description: "Array of Cloudinary image URLs"
    },
    wishlist: {
      type: [String],
      default: [],
    },
    recentSearches: {
      type: [
        {
          query: { 
            type: String, 
                 },
          timestamp: { 
            type: Number,
             default: Date.now
             }
        }
      ],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// PERF-AUDIT-2026-05: Section 4.2 — users collection indexes
// `email` already has unique index via field-level `unique: true`.
// `phone` already has a sparse index via field-level `sparse: true`; we do
// NOT redeclare it here (Mongoose 8 warns on duplicate index declarations).
userSchema.index(
  { fcmToken: 1 },
  {
    partialFilterExpression: { fcmToken: { $exists: true, $type: "string" } },
    name: "users_fcmToken_partial",
  }
); // 4.2 #2 — partial index excludes null/missing tokens (fan-out queries)
userSchema.index({ provider: 1, email: 1 });                         // 4.2 #3
userSchema.index({ role: 1, createdAt: -1 });                        // role-based admin lists

