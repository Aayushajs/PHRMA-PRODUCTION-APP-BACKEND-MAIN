/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines user accounts for e-pharmacy platform with authentication,   │
│  profile data, and role-based access. Stores personal details,        │
│  address, wishlist, and timestamps. Supports both customers and       │
│  administrators through role enumeration.                             │
└───────────────────────────────────────────────────────────────────────┘
*/

import RoleIndex from "../../Utils/Roles.enum";
import { Iuser } from "../Entities/user.Interface";
import { Schema, Document } from "mongoose";

export const userSchema = new Schema<Iuser & Document>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
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
      enum: ["ADMIN", "CUSTOMER"],
      default: RoleIndex.UNKNOWN,
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
