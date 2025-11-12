import {Types} from 'mongoose';

export interface Igst {
    
    gstName: string;
    gstDescription?: string;
    gstRate: number;
    
    cgstRate?: number;
    sgstRate?: number;
    igstRate?: number;
    
    isActive?: boolean;
    
    applicableFrom ?: Date;
    applicableTo ?: Date;
    
    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;
    
    createdAt?: Date;
    updatedAt?: Date;
}