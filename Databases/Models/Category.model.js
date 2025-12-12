/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Model - Mongoose model for product categories.              │
│  Connects the Category Schema to the 'Category' collection.           │
│  Applies logging middleware for tracking operations.                  │
└───────────────────────────────────────────────────────────────────────┘
*/
import { categorySchema } from "../Schema/Category.Schema";
import { model } from "mongoose";
import { CategoryLogger } from "../../Middlewares/LogMedillewares/categoryLogger";
// log middleware
CategoryLogger(categorySchema);
export const CategoryModel = model("Category", categorySchema);
