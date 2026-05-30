/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Interface - TypeScript definitions for user profiles.           │
│  Defines structure for user data including personal info and address. │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import RoleIndex from "../../Utils/auth/Roles.enum";

export interface Iuser {
  _id?: mongoose.Types.ObjectId;
  name: string;
  userName?: string; // mirror of Service 2's field on the shared users collection
  kycStatus?: "Pending" | "Verified" | "Rejected"; // shared field (owned by Service 2)
  isBlocked?: boolean;       // shared account-block flag (set by Service 2 admin)
  blockedReason?: string;
  email: string;
  password: string;
  phone: string;
  age: number;
  fcmToken?: string;
  lastLogin?: Date;
  category?: mongoose.Types.ObjectId[];
  itemsPurchased?: mongoose.Types.ObjectId[];
  viewedItems?: mongoose.Types.ObjectId[];
  viewedCategories?: mongoose.Types.ObjectId[];
  dob: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    location?: {
      longitude: number;
      latitude: number;
    };
  };
  role: RoleIndex;
  ProfileImage?: string[];
  wishlist?: string[];
  recentSearches?: Array<{
    query: string;
    timestamp: number;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}
