/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Model - Mongoose model for product items.                       │
│  Connects Item Schema to the 'Item' collection.                       │
└───────────────────────────────────────────────────────────────────────┘
*/
import { itemSchema } from "../Schema/items.Schema";
import { model } from "mongoose";
export const ItemModel = model("Item", itemSchema);
export default ItemModel;
