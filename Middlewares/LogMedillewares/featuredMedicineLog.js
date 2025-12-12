/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Logger - Middleware hooks for Featured Medicines.  │
│  Logs create, update, and delete events to FeaturedLog.               │
└───────────────────────────────────────────────────────────────────────┘
*/
import FeaturedLog from "../../Databases/Models/feturedLog.model";
export const FeaturedMedicineLogger = (featuredMedicineSchema) => {
    // CREATE → After Save
    featuredMedicineSchema.post("save", async function (doc) {
        await FeaturedLog.create({
            medicineId: doc._id,
            operation: "CREATE",
            action: "CREATE",
            performedBy: doc.createdBy || doc.updatedBy || null,
            newData: doc,
            summary: `Featured medicine '${doc.title}' was created`,
        });
    });
    // UPDATE → Before
    featuredMedicineSchema.pre("findOneAndUpdate", async function (next) {
        const oldData = await this.model.findOne(this.getQuery());
        this._oldData = oldData;
        next();
    });
    // UPDATE → After
    featuredMedicineSchema.post("findOneAndUpdate", async function (doc) {
        const oldData = this._oldData;
        if (doc) {
            await FeaturedLog.create({
                medicineId: doc._id,
                operation: "UPDATE",
                action: "UPDATE",
                performedBy: doc.updatedBy || null,
                oldData,
                newData: doc,
                summary: `Featured medicine '${doc.title}' was updated`,
            });
        }
    });
    // DELETE → Before
    featuredMedicineSchema.pre("findOneAndDelete", async function (next) {
        const oldData = await this.model.findOne(this.getQuery());
        this._oldData = oldData;
        next();
    });
    // DELETE → After
    featuredMedicineSchema.post("findOneAndDelete", async function (doc) {
        const oldData = this._oldData;
        if (doc) {
            await FeaturedLog.create({
                medicineId: doc._id,
                operation: "DELETE",
                action: "DELETE",
                performedBy: doc.updatedBy || null,
                oldData,
                summary: `Featured medicine '${oldData?.title || 'Unknown'}' was deleted`,
            });
        }
    });
};
