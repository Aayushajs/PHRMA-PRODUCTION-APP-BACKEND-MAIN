/**
 * Clean Expo Tokens from Database
 * Run this script to remove old Expo push tokens from user collection
 * Usage: bun run cleanExpoTokens.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserModel from './Databases/Models/user.Models';

dotenv.config({ path: './config/.env' });

async function cleanExpoTokens() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    // Find all users with Expo tokens
    const usersWithExpoTokens = await UserModel.find({
      fcmToken: { $regex: /^ExponentPushToken/ }
    });

    console.log(`\n📊 Found ${usersWithExpoTokens.length} users with Expo tokens`);

    if (usersWithExpoTokens.length === 0) {
      console.log('✅ No Expo tokens found! All clean.');
      process.exit(0);
    }

    console.log('\n🧹 Cleaning Expo tokens...\n');

    // Update all users to remove Expo tokens
    const result = await UserModel.updateMany(
      { fcmToken: { $regex: /^ExponentPushToken/ } },
      { $set: { fcmToken: '' } }
    );

    console.log(`✅ Cleaned ${result.modifiedCount} Expo tokens`);
    console.log(`\n📝 Users affected:`);
    usersWithExpoTokens.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (${user.name})`);
    });

    console.log('\n✅ Cleanup complete!');
    console.log('💡 Users need to login again from mobile app to get FCM tokens');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

cleanExpoTokens();
