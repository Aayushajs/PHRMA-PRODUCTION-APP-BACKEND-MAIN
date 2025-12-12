/*
┌───────────────────────────────────────────────────────────────────────┐
│  Parent Unit Model - MongoDB model for parent unit entity             │
│  Handles database operations for main unit categories.                │
└───────────────────────────────────────────────────────────────────────┘
*/
import { model } from "mongoose";
import { parentUnitSchema } from "../Schema/parentUnit.Schema";
export const ParentUnit = model("ParentUnit", parentUnitSchema);
export default ParentUnit;
