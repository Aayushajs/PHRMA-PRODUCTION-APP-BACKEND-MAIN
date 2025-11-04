import {CategoryLog} from "../Schema/categoryLog.Schema";
import {ICategoryLog} from "../Entities/categoryLog.interface";
import {model} from "mongoose";
const CategoryLogModel = model<ICategoryLog>("CategoryLog", CategoryLog);
export default CategoryLogModel;