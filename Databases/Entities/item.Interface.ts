import mongoose from "mongoose";

export interface Iitem {
    _id?: mongoose.Types.ObjectId;
    itemName: string;
    itemDescription :string;
    itemPrice: number;
    itemCategory: mongoose.Types.ObjectId;
    itemMfgDate: Date;
    itemExpiryDate: Date;
    itemImages?: string[];
    itemBrand?: string;
    itemBatchNumber?: string;
    itemDiscount?: number;
    itemRatings?: number;
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    deletedBy?: mongoose.Types.ObjectId;
    deletedAt?: Date;
}