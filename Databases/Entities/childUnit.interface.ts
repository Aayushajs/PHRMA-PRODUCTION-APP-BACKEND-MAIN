/*
┌───────────────────────────────────────────────────────────────────────┐
│  Child Unit Interface - TypeScript definitions for child units.       │
│  Defines structure for unit variations and conversion factors.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Schema } from "mongoose";

export interface IChildUnit {
  name: string;
  code: string;
  description?: string;
  weight: number;
  isActive: boolean;
  createdBy?: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}