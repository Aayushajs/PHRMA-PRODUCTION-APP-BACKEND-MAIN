/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Model - Mongoose model for feature flags.                │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import { featureFlagSchema } from "../Schema/featureFlag.Schema";
import { IFeatureFlag } from "../Entities/featureFlag.Interface";

const FeatureFlagModel = mongoose.model<IFeatureFlag & mongoose.Document>(
  "FeatureFlag",
  featureFlagSchema
);

export default FeatureFlagModel;
