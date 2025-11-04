import { Schema } from "mongoose";

export interface IChildUnit {
  parentUnitId: Schema.Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  weight: number;
  isActive: boolean;
  createdBy: Schema.Types.ObjectId;
  updatedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}