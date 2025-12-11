/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Logger - Middleware hooks for Advertisement schema.    │
│  Logs create, update, and delete events to AdvertisementLog.          │
└───────────────────────────────────────────────────────────────────────┘
*/

import AdvertisementLog from "../../Databases/Models/advertisementLog.model";
import mongoose from "mongoose";


export const attachAdvertisementLogs = (advertisementSchema: mongoose.Schema) => {
  // CREATE → After Save
  advertisementSchema.post("save", async function (doc: any) {
    await AdvertisementLog.create({
      advertisementId: doc._id,
      action: "CREATE",
      performedBy: doc.createdBy || doc.updatedBy || null,
      newData: doc,
    });
  });

  // UPDATE → Before + After
  advertisementSchema.pre("findOneAndUpdate", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  advertisementSchema.post("findOneAndUpdate", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await AdvertisementLog.create({
        advertisementId: doc._id,
        action: "UPDATE",
        performedBy: doc.updatedBy || null,
        oldData,
        newData: doc,
      });
    }
  });

  // DELETE → Before + After
  advertisementSchema.pre("findOneAndDelete", async function (next) {
    const oldData = await this.model.findOne(this.getQuery());
    (this as any)._oldData = oldData;
    next();
  });

  advertisementSchema.post("findOneAndDelete", async function (doc: any) {
    const oldData = (this as any)._oldData;
    if (doc) {
      await AdvertisementLog.create({
        advertisementId: doc._id,
        action: "DELETE",
        performedBy: doc.updatedBy || null,
        oldData,
      });
    }
  });
};
