/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Model - Mongoose model for feature flags.                │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose, { Model } from "mongoose";
import { featureFlagSchema } from "../Schema/featureFlag.Schema";
import { IFeatureFlag } from "../Entities/featureFlag.Interface";

const FeatureFlagModel = (mongoose.models.FeatureFlag as Model<IFeatureFlag & mongoose.Document>) || mongoose.model<IFeatureFlag & mongoose.Document>(
  "FeatureFlag",
  featureFlagSchema
);

export default FeatureFlagModel;
