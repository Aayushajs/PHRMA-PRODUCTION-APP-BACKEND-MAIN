/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Interface - TypeScript definitions for prescriptions.   │
│  Stores prescription data extracted from OCR with medical details,    │
│  medicine information, and prescription status tracking.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";

export interface IPrescription {
    _id?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId; // Reference to user
    ocrHistoryId?: mongoose.Types.ObjectId; // Reference to OCR history
    prescriptionCode: string; // Unique prescription code
    patientDetails: {
        patientName: string;
        patientAge?: number;
        patientGender?: "M" | "F" | "Other";
        patientPhone?: string;
        patientEmail?: string;
        patientAddress?: {
            street?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
        };
    };
    doctorName: string;
    doctorLicense?: string; // Medical license number
    hospitalName: string;
    hospitalContact?: string;
    prescriptionDate: Date;
    expiryDate?: Date; // When prescription expires
    consultationType?: "online" | "offline" | "phone"; // Type of consultation
    consultationFees?: number;
    medicines: Array<{
        medicineId?: mongoose.Types.ObjectId; // Reference to item
        medicineName: string;
        dosage: string; // e.g., "500mg"
        frequency: string; // e.g., "3 times daily"
        duration: string; // e.g., "7 days"
        quantity: number; // Total quantity to purchase
        routeOfAdministration?: string; // e.g., "oral", "injection"
        specialInstructions?: string; // e.g., "Take with food"
        estimatedPrice?: number;
        notes?: string;
    }>;
    diagnosis?: string; // Medical condition/diagnosis
    clinicalNotes?: string; // Additional clinical notes from doctor
    attachments?: Array<{
        fileName: string;
        fileUrl: string;
        fileType?: string;
    }>;
    status: "active" | "expired" | "completed" | "cancelled" | "pending";
    fulfillmentStatus?: "pending" | "processing" | "fulfilled" | "partial";
    isRecurring?: boolean; // Whether it's a recurring prescription
    recurringFrequency?: "weekly" | "bi-weekly" | "monthly";
    recurringEndDate?: Date;
    totalEstimatedCost?: number; // Total cost of all medicines
    insuranceDetails?: {
        providerName?: string;
        policyNumber?: string;
        coveragePercentage?: number;
    };
    allergies?: string[]; // Known allergies
    contraindications?: string[]; // Known contraindications
    isVerified?: boolean; // Whether prescription was manually verified
    verifiedBy?: mongoose.Types.ObjectId; // Admin/Pharmacist who verified
    verifiedDate?: Date;
    verificationNotes?: string;
    reminderEnabled?: boolean; // Whether to send medicine reminders
    reminderDates?: Date[]; // Dates for medicine reminders
    orderHistory?: Array<{
        orderId?: mongoose.Types.ObjectId;
        orderDate?: Date;
        medicinesOrdered?: string[];
        totalCost?: number;
    }>;
    // ============================================
    // BUCKET COLLECTION (Multi-Store Cart)
    // ============================================
    bucketCollections?: Array<{
        storeId: mongoose.Types.ObjectId; // Reference to medical store
        storeName: string;
        storePhone?: string;
        storeEmail?: string;
        storeAddress?: {
            street?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
        };
        distance?: number; // Distance in km
        storeRating?: number; // Store average rating (0-5)
        totalReviews?: number;
        deliveryTime?: number; // Estimated delivery time in minutes
        deliveryCharges?: number;
        minimumOrderValue?: number;
        medicines: Array<{
            medicineId: mongoose.Types.ObjectId; // Reference to item
            medicineName: string;
            dosage?: string;
            manufacturer?: string;
            batchNumber?: string;
            expiryDate?: Date;
            price: number; // Price at this store
            discount?: number; // Discount percentage (0-100)
            discountedPrice?: number; // Price after discount
            quantity: number; // Quantity in bucket (default 1)
            maxQuantityAvailable?: number;
            availability: "in_stock" | "out_of_stock" | "limited" | "pre_order";
            packSize?: number; // e.g., 10 tablets per pack
            packUnit?: string; // e.g., "strips", "bottles"
            notes?: string;
            addedAt?: Date;
        }>;
        storeSubtotal?: number; // Total for all medicines in this store
        storeDiscount?: number; // Store-level discount if applicable
        storeTotal?: number; // Subtotal + delivery charges
    }>;
    // Bucket Collection metadata
    bucketSessionId?: string; // For session-based tracking
    totalBucketMedicines?: number; // Total count of medicines across all stores in bucket
    totalBucketQuantity?: number; // Sum of all quantities in bucket
    bucketGrandTotal?: number; // Total cost including all stores and delivery
    totalBucketDiscount?: number; // Total savings from bucket
    bucketNotes?: string; // Special notes/instructions for bucket order
    paymentMethod?: string; // Payment method selected for bucket order
    couponCode?: string; // Applied coupon code
    couponDiscount?: number; // Discount from coupon
    bucketDeliveryAddress?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
        landmark?: string;
    };
    bucketSpecialInstructions?: string; // Special delivery instructions for bucket order
    isBucketExpired?: boolean; // Whether bucket session has expired
    bucketExpiresAt?: Date; // When bucket will expire (default 30 days)
    bucketStatus?: "active" | "abandoned" | "converted_to_order" | "cleared";
    estimatedBucketDeliveryDate?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}
