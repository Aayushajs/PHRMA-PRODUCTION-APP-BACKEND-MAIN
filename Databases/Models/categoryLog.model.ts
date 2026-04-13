/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Log Model - Mongoose model for category operation logs.     │
│  Connects CategoryLog Schema to the 'CategoryLog' collection.         │
│  Used for auditing category creations, updates, and deletions.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { CategoryLog } from "../Schema/categoryLog.Schema";
import { ICategoryLog } from "../Entities/categoryLog.interface";
import mongoose, { Model } from "mongoose";
const CategoryLogModel = (mongoose.models.CategoryLog as Model<ICategoryLog>) || mongoose.model<ICategoryLog>("CategoryLog", CategoryLog);
export default CategoryLogModel;