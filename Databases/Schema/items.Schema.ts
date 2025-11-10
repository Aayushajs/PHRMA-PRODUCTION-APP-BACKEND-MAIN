import {Iitem} from '../Entities/item.Interface';
import { Schema, Document } from "mongoose";

export const itemSchema = new Schema<Iitem & Document>(
    {
        itemName : {
            type: String,
            required: true,
            trim: true,
        },
        itemDescription : {
            type: String,
            trim: true,
        },
        itemPrice : {
            type: Number,
            required: true,
        },
        itemParentUnit:{
            type: Schema.Types.ObjectId,
            ref: "ParentUnit"
        },
        itemChildUnit:{
            type: Schema.Types.ObjectId,
            ref: "ChildUnit",
            required: true,
        },
        itemCategory : {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        itemMfgDate : {
            type: Date,
            required: true, 
        },
        itemExpiryDate : {
            type: Date,
            required: true,
        },
        itemImages : {
            type: [String],
            default: [],
        },
        itemBrand : {
            type: String,
            trim: true,
        },
        itemBatchNumber : {
            type: String,
            trim: true,
        },
        itemDiscount : {
            type: Number,
            default: 0,
        },
        itemRatings : {
            type: Number,
            default: 0, 
        },
        createdBy : {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        updatedBy : {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        createdAt : {
            type: Date,
            default: Date.now,
        },
        updatedAt : {
            type: Date,
            default: Date.now,
        },
        deletedBy : {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        deletedAt : {
            type: Date,
        },
    },
)