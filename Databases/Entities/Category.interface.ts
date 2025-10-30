import { Types } from "mongoose";

export interface ICategory {
  name: string;
  title: string;
  description?: string;
  imageUrl: string[];
  code: string;
  bannerUrl?: string[];
  offerText?: string;
  priority?: number;
  views: number;
  viewedBy: Types.ObjectId[];
  isFeatured?: boolean;
  isActive?: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}