import mongoose from "mongoose";

export interface IDataChange {
    fieldName: string;
    oldValue?: any;
    newValue?: any;
    changedAt?: Date;
}

export interface ICategoryLog {
    categoryId: mongoose.Types.ObjectId;
    operation: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    performedBy?: mongoose.Types.ObjectId;
    oldData?: IDataChange[];  
    newData?: IDataChange[]; 
    summary?: string;         
    timestamp?: Date;
}