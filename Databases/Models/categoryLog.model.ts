/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Log Model - Mongoose model for category operation logs.     │
│  Connects CategoryLog Schema to the 'CategoryLog' collection.         │
│  Used for auditing category creations, updates, and deletions.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { CategoryLog } from "../Schema/categoryLog.Schema";
import { ICategoryLog } from "../Entities/categoryLog.interface";
import { model } from "mongoose";
const CategoryLogModel = model<ICategoryLog>("CategoryLog", CategoryLog);
export default CategoryLogModel;