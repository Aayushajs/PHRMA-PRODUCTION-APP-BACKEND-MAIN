import mongoose from "mongoose";
import { gstSchema } from "../Schema/gst.Schema";

export const gstModel = mongoose.model("Gst", gstSchema);