/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Model - Mongoose model for product items.                       │
│  Connects Item Schema to the 'Item' collection.                       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { itemSchema } from "../Schema/items.Schema";
import { Iitem } from "../Entities/item.Interface";
import mongoose from "mongoose";

export const ItemModel = mongoose.models.Item || mongoose.model<Iitem>("Item", itemSchema);
export default ItemModel;