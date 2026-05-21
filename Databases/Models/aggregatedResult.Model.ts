/*
┌───────────────────────────────────────────────────────────────────────┐
│  Aggregated Result Model - Precomputed query-ready aggregation.       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { aggregatedResultSchema } from "../Schema/aggregatedResult.Schema";
import { IAggregatedResult } from "../Entities/aggregatedResult.interface";
import mongoose, { Model } from "mongoose";

export const AggregatedResultModel =
  (mongoose.models.AggregatedResult as Model<IAggregatedResult>) ||
  mongoose.model<IAggregatedResult>("AggregatedResult", aggregatedResultSchema);

export default AggregatedResultModel;
