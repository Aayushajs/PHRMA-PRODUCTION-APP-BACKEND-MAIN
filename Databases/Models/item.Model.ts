import { itemSchema } from  "../Schema/items.Schema";
import { Iitem } from "../Entities/item.Interface";
import { model } from "mongoose";

export const ItemModel = model<Iitem>("Item", itemSchema);
export default ItemModel;