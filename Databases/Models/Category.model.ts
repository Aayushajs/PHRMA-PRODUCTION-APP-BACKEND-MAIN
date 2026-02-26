/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Model - Mongoose model for product categories.              │
│  Connects the Category Schema to the 'Category' collection.           │
│  Applies logging middleware for tracking operations.                  │
└───────────────────────────────────────────────────────────────────────┘
*/

import { categorySchema } from "../Schema/Category.Schema";
import mongoose, { Model } from "mongoose";
import { ICategory } from "../Entities/Category.interface";
import { CategoryLogger } from "../../Middlewares/LogMedillewares/categoryLogger";

// log middleware
CategoryLogger(categorySchema);
export const CategoryModel = (mongoose.models.Category as Model<ICategory>) || mongoose.model<ICategory>("Category", categorySchema);
