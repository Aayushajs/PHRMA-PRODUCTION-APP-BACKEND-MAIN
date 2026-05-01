/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Schema - Stores prescription data with medicine details,│
│  patient info, doctor details, and prescription lifecycle management. │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IPrescription } from "../Entities/prescription.interface";
import { Schema, Document } from "mongoose";

export const prescriptionSchema = new Schema<IPrescription & Document>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        ocrHistoryId: {
            type: Schema.Types.ObjectId,
            ref: "OcrHistory",
        },
        prescriptionCode: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        patientDetails: {
            patientName: {
                type: String,
                required: true,
            },
            patientAge: {
                type: Number,
            },
            patientGender: {
                type: String,
                enum: ["Male", "Female", "Other"],
            },
            patientPhone: {
                type: String,
            },
            patientEmail: {
                type: String,
            },
            patientAddress: {
                street: String,
                city: String,
                state: String,
                zip: String,
                country: String,
                _id: false,
            },
        },
        doctorName: {
            type: String,
            required: true,
        },
        doctorLicense: {
            type: String,
        },
        hospitalName: {
            type: String,
            required: true,
        },
        hospitalContact: {
            type: String,
        },
        prescriptionDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        expiryDate: {
            type: Date,
        },
        consultationType: {
            type: String,
            enum: ["online", "offline", "phone"],
            default: "offline",
        },
        consultationFees: {
            type: Number,
        },
        medicines: [
            {
                medicineId: {
                    type: Schema.Types.ObjectId,
                    ref: "Item",
                },
                medicineName: {
                    type: String,
                    required: true,
                },
                dosage: {
                    type: String,
                    required: true,
                },
                frequency: {
                    type: String,
                    required: true,
                },
                duration: {
                    type: String,
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                routeOfAdministration: {
                    type: String,
                },
                specialInstructions: {
                    type: String,
                },
                estimatedPrice: {
                    type: Number,
                },
                notes: {
                    type: String,
                },
                _id: false,
            },
        ],
        diagnosis: {
            type: String,
        },
        clinicalNotes: {
            type: String,
        },
        attachments: [
            {
                fileName: {
                    type: String,
                },
                fileUrl: {
                    type: String,
                },
                fileType: {
                    type: String,
                },
                _id: false,
            },
        ],
        status: {
            type: String,
            enum: ["active", "expired", "completed", "cancelled", "pending"],
            default: "pending",
        },
        fulfillmentStatus: {
            type: String,
            enum: ["pending", "processing", "fulfilled", "partial"],
            default: "pending",
        },
        isRecurring: {
            type: Boolean,
            default: false,
        },
        recurringFrequency: {
            type: String,
            enum: ["weekly", "bi-weekly", "monthly"],
        },
        recurringEndDate: {
            type: Date,
        },
        totalEstimatedCost: {
            type: Number,
        },
        insuranceDetails: {
            providerName: String,
            policyNumber: String,
            coveragePercentage: Number,
            _id: false,
        },
        allergies: [String],
        contraindications: [String],
        isVerified: {
            type: Boolean,
            default: false,
        },
        verifiedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        verifiedDate: {
            type: Date,
        },
        verificationNotes: {
            type: String,
        },
        reminderEnabled: {
            type: Boolean,
            default: false,
        },
        reminderDates: [Date],
        orderHistory: [
            {
                orderId: {
                    type: Schema.Types.ObjectId,
                },
                orderDate: Date,
                medicinesOrdered: [String],
                totalCost: Number,
                _id: false,
            },
        ],
        // ============================================
        // BUCKET COLLECTION (Multi-Store Cart)
        // ============================================
        bucketCollections: [
            {
                storeId: {
                    type: Schema.Types.ObjectId,
                    required: true,
                },
                storeName: {
                    type: String,
                    required: true,
                },
                storePhone: String,
                storeEmail: String,
                storeAddress: {
                    street: String,
                    city: String,
                    state: String,
                    zip: String,
                    country: String,
                    _id: false,
                },
                distance: {
                    type: Number, // km
                },
                storeRating: {
                    type: Number,
                    min: 0,
                    max: 5,
                },
                totalReviews: {
                    type: Number,
                    default: 0,
                },
                deliveryTime: {
                    type: Number, // minutes
                },
                deliveryCharges: {
                    type: Number,
                    default: 0,
                },
                minimumOrderValue: {
                    type: Number,
                },
                medicines: [
                    {
                        medicineId: {
                            type: Schema.Types.ObjectId,
                            ref: "Item",
                            required: true,
                        },
                        medicineName: {
                            type: String,
                            required: true,
                        },
                        dosage: String,
                        manufacturer: String,
                        batchNumber: String,
                        expiryDate: Date,
                        price: {
                            type: Number,
                            required: true,
                        },
                        discount: {
                            type: Number,
                            min: 0,
                            max: 100,
                        },
                        discountedPrice: Number,
                        quantity: {
                            type: Number,
                            required: true,
                            default: 1,
                            min: 1,
                        },
                        maxQuantityAvailable: Number,
                        availability: {
                            type: String,
                            enum: ["in_stock", "out_of_stock", "limited", "pre_order"],
                            default: "in_stock",
                        },
                        packSize: Number,
                        packUnit: String,
                        notes: String,
                        addedAt: {
                            type: Date,
                            default: Date.now,
                        },
                        _id: false,
                    },
                ],
                storeSubtotal: Number,
                storeDiscount: Number,
                storeTotal: Number,
                _id: false,
            },
        ],
        // Bucket Collection metadata
        bucketSessionId: {
            type: String,
            unique: true,
            sparse: true,
        },
        totalBucketMedicines: {
            type: Number,
            default: 0,
        },
        totalBucketQuantity: {
            type: Number,
            default: 0,
        },
        bucketGrandTotal: {
            type: Number,
            default: 0,
        },
        totalBucketDiscount: {
            type: Number,
            default: 0,
        },
        bucketNotes: String,
        paymentMethod: String,
        couponCode: String,
        couponDiscount: {
            type: Number,
            default: 0,
        },
        bucketDeliveryAddress: {
            street: String,
            city: String,
            state: String,
            zip: String,
            country: String,
            landmark: String,
            _id: false,
        },
        bucketSpecialInstructions: String,
        isBucketExpired: {
            type: Boolean,
            default: false,
            index: true,
        },
        bucketExpiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        bucketStatus: {
            type: String,
            enum: ["active", "abandoned", "converted_to_order", "cleared"],
            default: "active",
        },
        estimatedBucketDeliveryDate: Date,
    },
    { timestamps: true }
);

// Index for faster queries
prescriptionSchema.index({ userId: 1, createdAt: -1 });
prescriptionSchema.index({ status: 1 });
prescriptionSchema.index({ prescriptionDate: -1 });
prescriptionSchema.index({ "medicines.medicineName": 1 });
prescriptionSchema.index({ bucketStatus: 1 });
prescriptionSchema.index({ "bucketCollections.storeId": 1 });

// TTL Index - auto-delete expired bucket sessions after 60 days
prescriptionSchema.index(
    { bucketExpiresAt: 1 },
    { expireAfterSeconds: 5184000, sparse: true } // 60 days
);
