/*
┌───────────────────────────────────────────────────────────────────────┐
│  GST Model - Mongoose model for GST tax configurations.               │
│  Connects GST Schema to the 'Gst' collection.                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import { gstSchema } from "../Schema/gst.Schema";
import { Igst } from "../Entities/gst.interface";

export const gstModel = (mongoose.models.Gst as mongoose.Model<Igst>) || mongoose.model<Igst>("Gst", gstSchema);
export default gstModel;
