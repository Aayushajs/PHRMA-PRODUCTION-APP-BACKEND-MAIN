import mongoose from "mongoose";
import RoleIndex from "../../utils/Roles.enum";

export interface Iuser {
  _id?: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone: string;
  age: number;
  fcmToken?: string;
  lastLogin?: Date;
  category?: mongoose.Types.ObjectId[];
  itemsPurchased?: mongoose.Types.ObjectId[];
  viewedItems?: mongoose.Types.ObjectId[];
  dob: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    location?: {
      longitude: number;
      latitude: number;
    };
  };
  role: RoleIndex;
  ProfileImage?: string[];
  wishlist?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
