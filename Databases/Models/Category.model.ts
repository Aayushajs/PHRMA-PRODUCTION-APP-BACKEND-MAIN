import {categorySchema} from "../Schema/Category.Schema";
import {model} from "mongoose";
import {ICategory} from "../Entities/Category.interface";

export const CategoryModel = model<ICategory>("Category", categorySchema);
