/*
┌───────────────────────────────────────────────────────────────────────┐
│  GST Model - Mongoose model for GST tax configurations.               │
│  Connects GST Schema to the 'Gst' collection.                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import { gstSchema } from "../Schema/gst.Schema";

export const gstModel = mongoose.model("Gst", gstSchema);