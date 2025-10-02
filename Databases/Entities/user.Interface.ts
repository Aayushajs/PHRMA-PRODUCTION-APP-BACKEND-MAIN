// import { Types } from 'mongoose';

export interface Iuser {
    _id: string;
    name: string;
    email: string;
    password: string;
    phone: string;
    age : number;
    dob : Date;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    };
    role?: "user" | "admin";
    avatar?: string;
    wishlist?: string[];
    createdAt?: Date;
    updatedAt?: Date;
}