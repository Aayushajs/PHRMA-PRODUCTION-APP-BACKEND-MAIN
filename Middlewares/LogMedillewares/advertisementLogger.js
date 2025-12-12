/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Logger - Middleware hooks for Advertisement schema.    │
│  Logs create, update, and delete events to AdvertisementLog.          │
└───────────────────────────────────────────────────────────────────────┘
*/
import AdvertisementLog from "../../Databases/Models/advertisementLog.model";
export const attachAdvertisementLogs = (advertisementSchema) => {
    // CREATE → After Save
    advertisementSchema.post("save", async function (doc) {
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
        this._oldData = oldData;
        next();
    });
    advertisementSchema.post("findOneAndUpdate", async function (doc) {
        const oldData = this._oldData;
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
        this._oldData = oldData;
        next();
    });
    advertisementSchema.post("findOneAndDelete", async function (doc) {
        const oldData = this._oldData;
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
