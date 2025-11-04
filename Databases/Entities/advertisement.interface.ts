import mongoose from "mongoose";

export interface IAdvertisement {
    title: string;
    description: string;
    type: "Product" | "Brand" | "Offer" | "Event";
    brand?: string;
    imageUrl: string;
    itemId?: mongoose.Schema.Types.ObjectId;
    categoryId?: mongoose.Schema.Types.ObjectId;
    offerText?: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    adClickTracking: {
        userId: mongoose.Schema.Types.ObjectId;
        timestamp: Date;    
    }[];
    createdBy?: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}