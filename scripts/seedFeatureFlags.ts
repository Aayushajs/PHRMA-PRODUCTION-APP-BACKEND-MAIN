/*
┌───────────────────────────────────────────────────────────────────────┐
│  Feature Flag Seed Script - Initialize default feature flags          │
│  Run this script to populate the database with initial flags.         │
│  Usage: bun run scripts/seedFeatureFlags.ts                           │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import FeatureFlagModel from "../Databases/Models/featureFlag.Models";
import RoleIndex from "../Utils/Roles.enum";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

// Initial feature flags to seed
const initialFlags = [
  {
    key: "ONLINE_PAYMENT",
    name: "Online Payment Gateway",
    description: "Enables online payment processing for orders",
    enabled: true,
    allowedRoles: [RoleIndex.ADMIN, RoleIndex.CUSTOMER],
    allowedUserIds: [],
    rolloutPercentage: 100,
  },
  {
    key: "FEATURED_MEDICINES",
    name: "Featured Medicines Section",
    description: "Displays featured/promoted medicines on homepage",
    enabled: true,
    allowedRoles: [RoleIndex.ADMIN],
    allowedUserIds: [],
    rolloutPercentage: 100,
  },
  {
    key: "AI_CHATBOT",
    name: "AI-Powered Chatbot",
    description: "AI assistant for customer queries and support",
    enabled: false,
    allowedRoles: [RoleIndex.ADMIN, RoleIndex.CUSTOMER],
    allowedUserIds: [],
    rolloutPercentage: 0,
  },
  {
    key: "ADVANCED_ANALYTICS",
    name: "Advanced Analytics Dashboard",
    description: "Detailed analytics and reports for business insights",
    enabled: true,
    allowedRoles: [RoleIndex.ADMIN],
    allowedUserIds: [],
    rolloutPercentage: 100,
  },
  {
    key: "PRESCRIPTION_UPLOAD",
    name: "Prescription Upload Feature",
    description: "Allows users to upload prescriptions for verification",
    enabled: true,
    allowedRoles: [RoleIndex.ADMIN, RoleIndex.PHARMACIST, RoleIndex.CUSTOMER],
    allowedUserIds: [],
    rolloutPercentage: 50, // Gradual rollout
  },
  {
    key: "BULK_ORDER",
    name: "Bulk Order Processing",
    description: "Enables bulk order feature for pharmacists",
    enabled: true,
    allowedRoles: [RoleIndex.ADMIN, RoleIndex.PHARMACIST],
    allowedUserIds: [],
    rolloutPercentage: 100,
  },
  {
    key: "LOYALTY_PROGRAM",
    name: "Loyalty Rewards Program",
    description: "Points-based loyalty program for frequent customers",
    enabled: false,
    allowedRoles: [RoleIndex.CUSTOMER],
    allowedUserIds: [],
    rolloutPercentage: 0,
  },
  {
    key: "VOICE_SEARCH",
    name: "Voice Search",
    description: "Voice-enabled medicine search functionality",
    enabled: false,
    allowedRoles: [RoleIndex.CUSTOMER],
    allowedUserIds: [],
    rolloutPercentage: 0,
  },
];

async function seedFeatureFlags() {
  try {
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/pharma";
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing feature flags (optional - comment out in production)
    // await FeatureFlagModel.deleteMany({});
    // console.log("🗑️  Cleared existing feature flags");

    // Insert initial flags
    let createdCount = 0;
    let skippedCount = 0;

    for (const flag of initialFlags) {
      const existing = await FeatureFlagModel.findOne({ key: flag.key });
      
      if (existing) {
        console.log(`⏭️  Skipped: ${flag.key} (already exists)`);
        skippedCount++;
      } else {
        await FeatureFlagModel.create(flag);
        console.log(`✅ Created: ${flag.key}`);
        createdCount++;
      }
    }

    console.log("\n📊 Seed Summary:");
    console.log(`   Created: ${createdCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total:   ${initialFlags.length}`);

    // Display all flags
    console.log("\n📋 All Feature Flags:");
    const allFlags = await FeatureFlagModel.find().select('key enabled allowedRoles rolloutPercentage');
    allFlags.forEach((flag) => {
      const status = flag.enabled ? "✅" : "❌";
      console.log(`   ${status} ${flag.key} (${flag.rolloutPercentage}% rollout)`);
    });

    console.log("\n🎉 Seed complete!");

  } catch (error) {
    console.error("❌ Seed failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the seed
seedFeatureFlags();
