import mongoose from "mongoose";
export interface IFeaturedMedicineLog {
    medicineId: mongoose.Types.ObjectId;
    operation: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    performedBy?: mongoose.Types.ObjectId;
    oldData?: object;
    newData?: object;
    timestamp?: Date;
}