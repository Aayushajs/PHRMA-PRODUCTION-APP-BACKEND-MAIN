/*
┌───────────────────────────────────────────────────────────────────────┐
│  Models Index - Central registration of all Mongoose models.          │
│  Import this file in App.ts to ensure all models are registered       │
│  BEFORE any queries are executed. This prevents MissingSchemaError.   │
└───────────────────────────────────────────────────────────────────────┘
*/

// Import all models to register them with Mongoose
// Order doesn't matter as long as they're all imported
import ItemModel from './item.Model';
import gstModel from './gst.Model';
import CategoryModel from './Category.model';
import UserModel from './user.Models';
import FeatureFlagModel from './featureFlag.Models';
import FeaturedMedicineModel from './FeaturedMedicine.model';
import AdvertisementModel from './advertisement.model';
import AdvertisementLogModel from './advertisementLog.model';
import CategoryLogModel from './categoryLog.model';
import FeaturedLogModel from './feturedLog.model';
import NotificationLogModel from './notificationLog.model';

// Export all models for convenience
export {
  ItemModel,
  gstModel,
  CategoryModel,
  UserModel,
  FeatureFlagModel,
  FeaturedMedicineModel,
  AdvertisementModel,
  AdvertisementLogModel,
  CategoryLogModel,
  FeaturedLogModel,
  NotificationLogModel,
};
