import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import PrescriptionModel from "../Databases/Models/prescription.Model";
import { ApiError } from "../Utils/ApiError";
import { asObjectId, recalculateBucket } from "../Utils/bucket.utils";
import { handleResponse } from "../Utils/handleResponse";

export interface BucketMedicinePayload {
  medicineId: string;
  medicineName: string;
  dosage?: string;
  manufacturer?: string;
  batchNumber?: string;
  expiryDate?: string;
  price?: number;
  discount?: number;
  discountedPrice?: number;
  quantity?: number;
  maxQuantityAvailable?: number;
  availability?: "in_stock" | "out_of_stock" | "limited" | "pre_order";
  packSize?: number;
  packUnit?: string;
  notes?: string;
}

export interface BucketStorePayload {
  storeId: string;
  storeName: string;
  storePhone?: string;
  storeEmail?: string;
  storeAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    landmark?: string;
  };
  distance?: number;
  storeRating?: number;
  totalReviews?: number;
  deliveryTime?: number;
  deliveryCharges?: number;
  minimumOrderValue?: number;
  medicines: BucketMedicinePayload[];
}

export default class BucketService {
  static async getBucket(userId: string, prescriptionId?: string) {
    const query: Record<string, any> = { userId: asObjectId(userId) };
    if (prescriptionId && mongoose.isValidObjectId(prescriptionId)) {
      query._id = asObjectId(prescriptionId);
    }

    const prescription = await PrescriptionModel.findOne(query).sort({ updatedAt: -1 }).lean();
    if (!prescription) {
      return null;
    }

    return {
      prescriptionId: prescription._id,
      bucketCollections: prescription.bucketCollections || [],
      totalBucketMedicines: prescription.totalBucketMedicines || 0,
      totalBucketQuantity: prescription.totalBucketQuantity || 0,
      bucketGrandTotal: prescription.bucketGrandTotal || 0,
      bucketStatus: prescription.bucketStatus || "active",
      bucketExpiresAt: prescription.bucketExpiresAt,
    };
  }

  static async addToBucket(params: {
    userId: string;
    prescriptionId: string;
    store: BucketStorePayload;
  }) {
    const prescription = await PrescriptionModel.findOne({
      _id: asObjectId(params.prescriptionId),
      userId: asObjectId(params.userId),
    });

    if (!prescription) {
      throw new ApiError(404, "Prescription not found");
    }

    const bucketCollections: any[] = Array.isArray(prescription.bucketCollections)
      ? [...(prescription.bucketCollections as any[])]
      : [];

    const existingStoreIndex = bucketCollections.findIndex(
      (store: any) => String(store.storeId) === String(params.store.storeId),
    );

    const sanitizedMedicines = (params.store.medicines || []).map((medicine) => ({
      ...medicine,
      medicineId: asObjectId(medicine.medicineId),
      quantity: Math.max(1, Number(medicine.quantity || 1)),
      price: Number(medicine.price || 0),
      discountedPrice:
        typeof medicine.discountedPrice === "number"
          ? medicine.discountedPrice
          : Number(medicine.price || 0) * (1 - Number(medicine.discount || 0) / 100),
      addedAt: new Date(),
      expiryDate: medicine.expiryDate ? new Date(medicine.expiryDate) : undefined,
    }));

    if (existingStoreIndex >= 0) {
      const existingStore: any = bucketCollections[existingStoreIndex];
      const mergedMedicines: any[] = [...(existingStore?.medicines || [])];

      for (const medicine of sanitizedMedicines) {
        const existingMedicineIndex = mergedMedicines.findIndex(
          (item: any) => String(item.medicineId) === String(medicine.medicineId),
        );

        if (existingMedicineIndex >= 0) {
          const currentMedicine = mergedMedicines[existingMedicineIndex];
          mergedMedicines[existingMedicineIndex] = {
            ...currentMedicine,
            quantity: Number(currentMedicine?.quantity || 1) + Number(medicine.quantity || 1),
            price: medicine.price,
            discountedPrice: medicine.discountedPrice,
            availability: medicine.availability || currentMedicine?.availability,
          };
        } else {
          mergedMedicines.push(medicine);
        }
      }

      bucketCollections[existingStoreIndex] = {
        ...(existingStore || {}),
        ...params.store,
        storeId: asObjectId(params.store.storeId),
        medicines: mergedMedicines,
      };
    } else {
      bucketCollections.push({
        ...params.store,
        storeId: asObjectId(params.store.storeId),
        medicines: sanitizedMedicines,
      });
    }

    for (let index = bucketCollections.length - 1; index >= 0; index -= 1) {
      const store: any = bucketCollections[index];
      const storeMedicines = store?.medicines || [];
      const storeSubtotal = storeMedicines.reduce((total: number, medicine: any) => {
        const price = Number(medicine.discountedPrice ?? medicine.price ?? 0);
        return total + price * Number(medicine.quantity || 1);
      }, 0);
      const storeTotal = storeSubtotal + Number(store?.deliveryCharges || 0) - Number(store?.storeDiscount || 0);
      bucketCollections[index] = {
        ...store,
        storeSubtotal,
        storeTotal,
      };

      if (storeMedicines.length === 0) {
        bucketCollections.splice(index, 1);
      }
    }

    const totals = recalculateBucket(bucketCollections);

    prescription.bucketCollections = bucketCollections;
    prescription.totalBucketMedicines = totals.totalBucketMedicines;
    prescription.totalBucketQuantity = totals.totalBucketQuantity;
    prescription.bucketGrandTotal = totals.bucketGrandTotal;
    prescription.bucketStatus = "active";
    prescription.bucketExpiresAt = prescription.bucketExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    prescription.isBucketExpired = false;
    await prescription.save();

    return {
      bucketCollections,
      ...totals,
    };
  }

  static async removeFromBucket(params: {
    userId: string;
    prescriptionId: string;
    storeId: string;
    medicineId?: string;
  }) {
    const prescription = await PrescriptionModel.findOne({
      _id: asObjectId(params.prescriptionId),
      userId: asObjectId(params.userId),
    });

    if (!prescription) {
      throw new ApiError(404, "Prescription not found");
    }

    const bucketCollections: any[] = Array.isArray(prescription.bucketCollections)
      ? [...(prescription.bucketCollections as any[])]
      : [];

    const storeIndex = bucketCollections.findIndex(
      (store: any) => String(store.storeId) === String(params.storeId),
    );

    if (storeIndex < 0) {
      throw new ApiError(404, "Store not found in bucket");
    }

    if (params.medicineId) {
      const store: any = bucketCollections[storeIndex];
      store.medicines = (store.medicines || []).filter(
        (medicine: any) => String(medicine.medicineId) !== String(params.medicineId),
      );
      bucketCollections[storeIndex] = store;
    } else {
      bucketCollections.splice(storeIndex, 1);
    }

    const refreshedStore: any = bucketCollections[storeIndex];
    if (refreshedStore && (refreshedStore.medicines || []).length === 0) {
      bucketCollections.splice(storeIndex, 1);
    }

    const totals = recalculateBucket(bucketCollections);

    prescription.bucketCollections = bucketCollections as any;
    prescription.totalBucketMedicines = totals.totalBucketMedicines;
    prescription.totalBucketQuantity = totals.totalBucketQuantity;
    prescription.bucketGrandTotal = totals.bucketGrandTotal;
    prescription.bucketStatus = bucketCollections.length > 0 ? "active" : "cleared";
    prescription.isBucketExpired = false;
    await prescription.save();

    return {
      bucketCollections,
      ...totals,
    };
  }

  static async handleGetBucket(req: Request, res: Response, next: NextFunction): Promise<any> {
    try {
      const prescriptionId = req.query.prescriptionId ? String(req.query.prescriptionId) : undefined;
      const bucket = await this.getBucket(String((req as any).user?._id), prescriptionId);
      return handleResponse(req, res, 200, "Bucket retrieved successfully", bucket || { bucketCollections: [] });
    } catch (error) {
      return next(error);
    }
  }

  static async handleAddToBucket(req: Request, res: Response, next: NextFunction): Promise<any> {
    try {
      const { prescriptionId, store } = req.body;
      if (!prescriptionId || !store?.storeId || !store?.storeName) {
        throw new ApiError(400, "prescriptionId and store data are required");
      }

      const result = await this.addToBucket({
        userId: String((req as any).user?._id),
        prescriptionId: String(prescriptionId),
        store,
      });

      return handleResponse(req, res, 200, "Medicine added to bucket successfully", result);
    } catch (error) {
      return next(error);
    }
  }

  static async handleRemoveFromBucket(req: Request, res: Response, next: NextFunction): Promise<any> {
    try {
      const { prescriptionId, storeId, medicineId } = req.body;
      if (!prescriptionId || !storeId) {
        throw new ApiError(400, "prescriptionId and storeId are required");
      }

      const result = await this.removeFromBucket({
        userId: String((req as any).user?._id),
        prescriptionId: String(prescriptionId),
        storeId: String(storeId),
        medicineId: medicineId ? String(medicineId) : undefined,
      });

      return handleResponse(req, res, 200, "Medicine removed from bucket successfully", result);
    } catch (error) {
      return next(error);
    }
  }
}
