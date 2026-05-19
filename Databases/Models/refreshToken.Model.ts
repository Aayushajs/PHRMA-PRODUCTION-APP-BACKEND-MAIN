/*
┌───────────────────────────────────────────────────────────────────────┐
│  Refresh Token Model - Mongoose model for refresh token store.        │
│  Connects refreshTokenSchema to the 'RefreshToken' collection.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { refreshTokenSchema } from "../Schema/refreshToken.Schema";
import { IRefreshToken } from "../Entities/refreshToken.Interface";
import mongoose, { Model } from "mongoose";

const RefreshTokenModel =
  (mongoose.models.RefreshToken as Model<IRefreshToken>) ||
  mongoose.model<IRefreshToken>("RefreshToken", refreshTokenSchema);

export default RefreshTokenModel;
