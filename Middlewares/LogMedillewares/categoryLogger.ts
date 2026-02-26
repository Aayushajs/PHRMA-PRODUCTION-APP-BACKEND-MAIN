/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Logger - Middleware hooks for Category schema operations.   │
│  Logs create, update, and delete events to CategoryLog.               │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Schema } from "mongoose";
import CategoryLogModel from "../../Databases/Models/categoryLog.model";

export const CategoryLogger = (categorySchema: Schema) => {
  // CREATE → After Save
  categorySchema.post("save", async function (doc: any) {
    await CategoryLogModel.create({
      categoryId: doc._id,
      operation: "CREATE",
      action: "CREATE",
      performedBy: doc.createdBy || doc.updatedBy || null,
      newData: doc,
      summary: `Category '${doc.name}' was created`,
    });
  });

  // UPDATE → Before
  categorySchema.pre("findOneAndUpdate", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  // UPDATE → After
  categorySchema.post("findOneAndUpdate", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await CategoryLogModel.create({
        categoryId: doc._id,
        operation: "UPDATE",
        action: "UPDATE",
        performedBy: doc.updatedBy || null,
        oldData,
        newData: doc,
        summary: `Category '${doc.name}' was updated`,
      });
    }
  });

  // DELETE → Before
  categorySchema.pre("findOneAndDelete", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  // DELETE → After
  categorySchema.post("findOneAndDelete", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await CategoryLogModel.create({
        categoryId: doc._id,
        operation: "DELETE",
        action: "DELETE",
        performedBy: doc.updatedBy || null,
        oldData,
        summary: `Category '${oldData?.name || 'Unknown'}' was deleted`,
      });
    }
  });
};