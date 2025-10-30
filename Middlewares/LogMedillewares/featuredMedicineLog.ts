/*───────────────────────────────────────────────────────────────────────────────
  Hooks for FeaturedMedicine model — handles automatic logging
  on create, update, and delete events.
───────────────────────────────────────────────────────────────────────────────*/

import { Schema } from "mongoose";
import FeaturedLog from "../../Databases/Models/feturedLog.model";

export const FeaturedMedicineLogger = (featuredMedicineSchema: Schema) => {
  // CREATE → After Save
  featuredMedicineSchema.post("save", async function (doc: any) {
    await FeaturedLog.create({
      medicineId: doc._id,
      action: "CREATE",
      performedBy: doc.updatedBy || null,
      newData: doc,
    });
  });

  // UPDATE → Before
  featuredMedicineSchema.pre("findOneAndUpdate", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  // UPDATE → After
  featuredMedicineSchema.post("findOneAndUpdate", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await FeaturedLog.create({
        medicineId: doc._id,
        action: "UPDATE",
        performedBy: doc.updatedBy || null,
        oldData,
        newData: doc,
      });
    }
  });

  // DELETE → Before
  featuredMedicineSchema.pre("findOneAndDelete", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  // DELETE → After
  featuredMedicineSchema.post("findOneAndDelete", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await FeaturedLog.create({
        medicineId: doc._id,
        action: "DELETE",
        performedBy: doc.updatedBy || null,
        oldData,
      });
    }
  });
};
