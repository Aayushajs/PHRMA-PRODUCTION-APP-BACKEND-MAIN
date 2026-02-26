/*
┌───────────────────────────────────────────────────────────────────────┐
│  Parent Unit Interface - TypeScript interface for parent unit entity  │
│  Defines main unit categories for medicines with comprehensive types. │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Schema } from "mongoose";

export interface IParentUnit {
  name: string;
  code: string;
  childUnitId?: Schema.Types.ObjectId;
  description?: string;
  isActive: boolean;
  createdBy?: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

