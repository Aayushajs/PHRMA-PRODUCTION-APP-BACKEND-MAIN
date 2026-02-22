/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Interface - TypeScript definitions for product items.           │
│  Defines structure for medicine details, stock, prices, and expiry.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Types } from "mongoose";

export interface Iitem {
  itemName: string;
  itemDescription?: string;
  itemInitialPrice: number;
  itemFinalPrice: number;

  itemParentUnit?: Types.ObjectId;
  itemChildUnit: Types.ObjectId;
  itemCategory: Types.ObjectId;

  itemMfgDate: Date;
  itemExpiryDate: Date;

  itemImages?: string[];
  itemCompany?: string;
  itemBatchNumber?: string;

  itemDiscount?: number;
  itemRatings?: number;
  itemGST?: Types.ObjectId;

  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;

  code?: string;
  HSNCode?: string;
  formula?: string;

  views?: number;
  images?: string[];

  changeLog?: {
    date: Date;
    by: {
      name: string;
      userId: Types.ObjectId;
    };
  }[];

  weight?: string;

  stockAisleIds?: Types.ObjectId[];

  isTrending?: boolean;

  otherInformation?:{ 
    keyFeatures?:string[],
    benefits?:string[],
    sideEffects?:string[],
    precautions?:string[],
    contraindications?:string[],
    interactions?:string[],
    allergyInfo?:string[],
    warnings?:string[],
    howToUse?:string,
    safetyAdvice?:string[],
    ingredients?:string[],
    
  };
}