/*
┌───────────────────────────────────────────────────────────────────────┐
│  Child Unit Model - MongoDB model for child unit entity               │
│  Handles database operations for specific unit variations.            │
└───────────────────────────────────────────────────────────────────────┘
*/
import { model } from "mongoose";
import { childUnitSchema } from "../Schema/childUnit.Schema";
export const ChildUnit = model("ChildUnit", childUnitSchema);
export default ChildUnit;
