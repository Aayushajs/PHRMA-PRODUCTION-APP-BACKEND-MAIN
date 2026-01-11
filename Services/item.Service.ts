/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Service - Business logic for Item/Product management.           │
│  Handles creation, updates, retrieval, deals, and image uploads.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { redis } from "../config/redis";
import ItemModel from "../Databases/Models/item.Model"
import { Iuser } from "../Databases/Entities/user.Interface";
import userModel from "../Databases/Models/user.Models";
import ChildUnitModel from "../Databases/Models/childUnit.model";
import ParentUnitModel from "../Databases/Models/parentUnit.model";
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import { v2 as cloudinary } from "cloudinary";
import { gstModel } from '../Databases/Models/gst.Model'
import mongoose from "mongoose";
import { MRPVerificationService } from './mrpVerification.Service';



declare global {
    namespace Express {
        interface Request {
            user?: Iuser; // or any, if you don’t have an interface
        }
    }
}

export default class ItemServices {
    //only serching and ganuvan price and mrp 
    public static createItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const {
                itemName,
                itemInitialPrice,
                itemDescription,
                itemCategory,
                itemMfgDate,
                itemExpiryDate,
                itemParentUnit,
                itemChildUnit,
                itemGST,
                code,
                formula,
                HSNCode,
                weight,
                otherInformation
            } = req.body;

            console.log("Requested to body : ", req.body);

            const fields = {
                itemName,
                itemInitialPrice,
                itemCategory,
                itemMfgDate,
                itemExpiryDate,
                itemChildUnit,
                code,
                HSNCode,
                weight,
                itemGST
            };

            const missing = (Object.keys(fields) as Array<keyof typeof fields>)
                .filter(key => !fields[key]);

            if (missing.length > 0) {
                const message =
                    missing.length === 1
                        ? `${missing[0]} is required`
                        : `${missing.join(", ")} are required`;
                return next(new ApiError(400, message));
            }

            const mfgDate = new Date(itemMfgDate);
            const expiryDate = new Date(itemExpiryDate);
            const now = new Date();

            if (isNaN(mfgDate.getTime()) || isNaN(expiryDate.getTime())) {
                return next(new ApiError(400, "Invalid Date Format for Mfg or Expiry Date"));
            }

            if (mfgDate > now) {
                return next(new ApiError(400, "Manufacturing Date cannot be in the future"));
            }

            //  Logical Validity Check (Expiry > Mfg)
            if (expiryDate <= mfgDate) {
                return next(new ApiError(400, "Expiry Date must be strictly after Manufacturing Date"));
            }

            const existingItem = await ItemModel.findOne({ itemName: itemName });
            if (existingItem) {
                return next(new ApiError(409, `Item already exists ${itemName} name`));
            }

            const childUnit = await ChildUnitModel.findById(itemChildUnit);
            if (!childUnit) {
                return next(new ApiError(404, "Child Unit not found"));
            }

            let finalParentUnit = undefined;
            if (itemParentUnit) {
                const parentUnitId = await ParentUnitModel.findById(itemParentUnit);
                if (!parentUnitId) return next(new ApiError(404, "Parent Unit not found"));
                finalParentUnit = parentUnitId._id;
            }

            let imageUrls: string[] = [];

            // If files are uploaded via form-data
            if (req.files && Array.isArray(req.files)) {
                try {
                    const uploadResults = await Promise.all(
                        (req.files as Express.Multer.File[]).map(file =>
                            uploadToCloudinary(file.buffer, "Epharma/items") // Folder name
                        )
                    );
                    imageUrls = uploadResults.map(r => r.secure_url);
                } catch (error) {
                    console.error("Cloudinary upload error:", error);
                    return next(new ApiError(500, "Failed to upload item images"));
                }
            }
            // If frontend sends existing URLs (string or array)
            else if (req.body.itemImages) {
                if (Array.isArray(req.body.itemImages)) {
                    imageUrls = req.body.itemImages;
                } else if (typeof req.body.itemImages === "string") {
                    imageUrls = [req.body.itemImages];
                }
            }

            const gstId = await gstModel.findById(itemGST).select('gstRate').lean();
            const gstRate = gstId?.gstRate ?? 0;

            const calculatedFinalPrice = +(itemInitialPrice * (1 + (Number(gstRate) || 0) / 100)).toFixed(2);

            const processedOtherInfo: any = {};
            if (otherInformation) {
                const info = typeof otherInformation === 'string' ? JSON.parse(otherInformation) : otherInformation;

                if (info.keyFeatures) processedOtherInfo.keyFeatures = Array.isArray(info.keyFeatures) ? info.keyFeatures : [info.keyFeatures];
                if (info.benefits) processedOtherInfo.benefits = Array.isArray(info.benefits) ? info.benefits : [info.benefits];
                if (info.precautions) processedOtherInfo.precautions = Array.isArray(info.precautions) ? info.precautions : [info.precautions];
                if (info.allergyInfo) processedOtherInfo.allergyInfo = Array.isArray(info.allergyInfo) ? info.allergyInfo : [info.allergyInfo];
                if (info.sideEffects) processedOtherInfo.sideEffects = Array.isArray(info.sideEffects) ? info.sideEffects : [info.sideEffects];
                if (info.howToUse) processedOtherInfo.howToUse = String(info.howToUse).trim();
                if (info.safetyAdvice) processedOtherInfo.safetyAdvice = Array.isArray(info.safetyAdvice) ? info.safetyAdvice : [info.safetyAdvice];
                if (info.ingredients) processedOtherInfo.ingredients = Array.isArray(info.ingredients) ? info.ingredients : [info.ingredients];
            }

            // === MRP VERIFICATION (REAL-TIME) ===
            let mrpVerificationData: any = { status: 'pending', needsAdminReview: true };
            try {
                const verificationResult = await MRPVerificationService.verifyMRP({
                    itemName,
                    itemCompany: req.body.itemCompany,
                    formula: req.body.formula,
                    userEnteredPrice: calculatedFinalPrice,
                    packSize: req.body.packSize,
                    category: itemCategory
                });

                mrpVerificationData = {
                    status: verificationResult.status,
                    systemFinalMRP: verificationResult.systemFinalMRP,
                    userEnteredPrice: verificationResult.userEnteredPrice,
                    maxAllowedPrice: verificationResult.maxAllowedPrice,
                    finalScore: verificationResult.finalScore,
                    reason: verificationResult.reason,
                    difference: verificationResult.difference,
                    stageUsed: verificationResult.stageUsed,
                    needsAdminReview: verificationResult.needsAdminReview,
                    verifiedAt: new Date(),
                    realtimeReferences: verificationResult.realtimeReferences
                };
                console.log('✅ MRP Verified:', verificationResult.status);
            } catch (error) {
                console.error('❌ MRP Verification Failed:', error);
            }

            const newItemData: any = {
                itemName,
                itemInitialPrice: Number(itemInitialPrice),
                itemFinalPrice: Number(calculatedFinalPrice),
                itemDescription,
                itemImages: imageUrls,
                itemCategory,
                itemMfgDate,
                itemParentUnit: finalParentUnit,
                itemChildUnit,
                itemExpiryDate,
                code,
                HSNCode,
                weight,
                itemGST,
                createdBy: req.user?._id,
                createAt: Date.now(),
                mrpVerification: mrpVerificationData,
                otherInformation: processedOtherInfo
            }

            console.log("New data : ", newItemData);

            const newItem: any = await ItemModel.create(newItemData);
            await redis.del("deals:of-the-day");

            return handleResponse(req, res, 201, "Item created successfully", {
                item: newItem,
                priceVerification: mrpVerificationData
            });
        }
    )

    //alow create all price , mrp in item have no any rules 
    public static createPremiumItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const {
                itemName,
                itemInitialPrice,
                itemDescription,
                itemCategory,
                itemMfgDate,
                itemExpiryDate,
                itemParentUnit,
                itemChildUnit,
                itemGST,
                code,
                HSNCode,
                weight,
                otherInformation
            } = req.body;

            console.log("Requested to body : ", req.body);

            const fields = {
                itemName,
                itemInitialPrice,
                itemCategory,
                itemMfgDate,
                itemExpiryDate,
                itemChildUnit,
                code,
                HSNCode,
                weight,
                itemGST
            };

            const missing = (Object.keys(fields) as Array<keyof typeof fields>)
                .filter(key => !fields[key]);

            if (missing.length > 0) {
                const message =
                    missing.length === 1
                        ? `${missing[0]} is required`
                        : `${missing.join(", ")} are required`;
                return next(new ApiError(400, message));
            }

            const mfgDate = new Date(itemMfgDate);
            const expiryDate = new Date(itemExpiryDate);
            const now = new Date();

            if (isNaN(mfgDate.getTime()) || isNaN(expiryDate.getTime())) {
                return next(new ApiError(400, "Invalid Date Format for Mfg or Expiry Date"));
            }

            if (mfgDate > now) {
                return next(new ApiError(400, "Manufacturing Date cannot be in the future"));
            }

            //  Logical Validity Check (Expiry > Mfg)
            if (expiryDate <= mfgDate) {
                return next(new ApiError(400, "Expiry Date must be strictly after Manufacturing Date"));
            }

            const existingItem = await ItemModel.findOne({ itemName: itemName });
            if (existingItem) {
                return next(new ApiError(409, `Item already exists ${itemName} name`));
            }

            const childUnit = await ChildUnitModel.findById(itemChildUnit);
            if (!childUnit) {
                return next(new ApiError(404, "Child Unit not found"));
            }

            let finalParentUnit = undefined;
            if (itemParentUnit) {
                const parentUnitId = await ParentUnitModel.findById(itemParentUnit);
                if (!parentUnitId) return next(new ApiError(404, "Parent Unit not found"));
                finalParentUnit = parentUnitId._id;
            }

            let imageUrls: string[] = [];

            // If files are uploaded via form-data
            if (req.files && Array.isArray(req.files)) {
                try {
                    const uploadResults = await Promise.all(
                        (req.files as Express.Multer.File[]).map(file =>
                            uploadToCloudinary(file.buffer, "Epharma/items") // Folder name
                        )
                    );
                    imageUrls = uploadResults.map(r => r.secure_url);
                } catch (error) {
                    console.error("Cloudinary upload error:", error);
                    return next(new ApiError(500, "Failed to upload item images"));
                }
            }
            // If frontend sends existing URLs (string or array)
            else if (req.body.itemImages) {
                if (Array.isArray(req.body.itemImages)) {
                    imageUrls = req.body.itemImages;
                } else if (typeof req.body.itemImages === "string") {
                    imageUrls = [req.body.itemImages];
                }
            }

            const gstId = await gstModel.findById(itemGST).select('gstRate').lean();
            const gstRate = gstId?.gstRate ?? 0;

            const calculatedFinalPrice = +(itemInitialPrice * (1 + (Number(gstRate) || 0) / 100)).toFixed(2);

            const processedOtherInfo: any = {};
            if (otherInformation) {
                const info = typeof otherInformation === 'string' ? JSON.parse(otherInformation) : otherInformation;

                if (info.keyFeatures) processedOtherInfo.keyFeatures = Array.isArray(info.keyFeatures) ? info.keyFeatures : [info.keyFeatures];
                if (info.benefits) processedOtherInfo.benefits = Array.isArray(info.benefits) ? info.benefits : [info.benefits];
                if (info.precautions) processedOtherInfo.precautions = Array.isArray(info.precautions) ? info.precautions : [info.precautions];
                if (info.allergyInfo) processedOtherInfo.allergyInfo = Array.isArray(info.allergyInfo) ? info.allergyInfo : [info.allergyInfo];
                if (info.sideEffects) processedOtherInfo.sideEffects = Array.isArray(info.sideEffects) ? info.sideEffects : [info.sideEffects];
                if (info.howToUse) processedOtherInfo.howToUse = String(info.howToUse).trim();
                if (info.safetyAdvice) processedOtherInfo.safetyAdvice = Array.isArray(info.safetyAdvice) ? info.safetyAdvice : [info.safetyAdvice];
                if (info.ingredients) processedOtherInfo.ingredients = Array.isArray(info.ingredients) ? info.ingredients : [info.ingredients];
            }

            const newItemData: any = {
                itemName,
                itemInitialPrice: Number(itemInitialPrice),
                itemFinalPrice: Number(calculatedFinalPrice),
                itemDescription,
                itemImages: imageUrls,
                itemCategory,
                itemMfgDate,
                itemParentUnit: finalParentUnit,
                itemChildUnit,
                itemExpiryDate,
                code,
                HSNCode,
                weight,
                itemGST,
                createdBy: req.user?._id,
                createAt: Date.now(),
                otherInformation: processedOtherInfo
            }

            console.log("New data : ", newItemData);

            const newItem: any = await ItemModel.create(newItemData);
            await redis.del("deals:of-the-day");

            return handleResponse(req, res, 201, "Item created successfully", newItem);
        }
    )

    public static updateItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const itemId = req.params.itemId;
            const updateData = req.body;

            if (
                updateData.otherInformation &&
                typeof updateData.otherInformation === "string"
            ) {
                try {
                    updateData.otherInformation = JSON.parse(updateData.otherInformation);
                } catch (err) {
                    return next(
                        new ApiError(400, "Invalid otherInformation format")
                    );
                }
            }

            const existingItem = await ItemModel.findById(itemId);
            if (!existingItem) {
                return next(new ApiError(404, "Item not found"));
            }

            let imageUrls: string[] = existingItem.itemImages || [];
            if (req.files && Array.isArray(req.files) && req.files.length > 0) {
                try {
                    const uploadResults = await Promise.all(
                        (req.files as Express.Multer.File[]).map(file =>
                            uploadToCloudinary(file.buffer, "Epharma/items") // Folder name
                        )
                    );
                    imageUrls = uploadResults.map(r => r.secure_url);
                } catch (error) {
                    console.error("Cloudinary upload error:", error);
                    return next(new ApiError(500, "Failed to upload item images"));
                }
            }
            else if (req.body.itemImages) {
                if (Array.isArray(req.body.itemImages)) {
                    imageUrls = req.body.itemImages;
                } else if (typeof req.body.itemImages === "string") {
                    imageUrls = [req.body.itemImages];
                }
            }

            let itemFinalPrice = existingItem.itemFinalPrice;
            if (updateData.itemInitialPrice || updateData.itemGst) {
                const basePrice = Number(updateData.itemInitialPrice ?? existingItem.itemInitialPrice);
                const gstId = updateData.itemGST ?? existingItem.itemGST;

                let gstRate = 0;
                if (gstId) {
                    const gstData = await gstModel.findById(gstId).select("gstRate").lean();
                    gstRate = gstData?.gstRate ?? 0;
                }

                itemFinalPrice = +((basePrice + (basePrice * gstRate) / 100)).toFixed(2);
            }

            const updatedItem: any = await ItemModel.findByIdAndUpdate(
                itemId,
                {
                    ...updateData,
                    itemImages: imageUrls,
                    itemFinalPrice,
                    updatedBy: req.user?._id,
                    updatedAt: new Date()
                },
                { new: true }
            );
            if (!updatedItem) {
                return next(
                    new ApiError(404, "Item not found")
                );
            }

            await redis.del("deals:of-the-day");

            handleResponse(req, res, 200, "Item updated successfully", updatedItem);
        }
    )

    public static deleteItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const itemId = req.params.itemId;

            const existingItem = await ItemModel.findById(itemId);
            if (!existingItem) {
                return next(new ApiError(404, "Item not found"));
            }

            if (existingItem.itemImages && existingItem.itemImages.length > 0) {
                try {
                    const publicIds = existingItem.itemImages.map((url: string) => {
                        const parts = url.split("/");
                        const fileName = parts[parts.length - 1];
                        const publicId = fileName ? fileName.split(".")[0] : "";
                        return `Epharma/items/${publicId}`;
                    });

                    await Promise.all(
                        publicIds.map(async (pid) => {
                            try {
                                await cloudinary.uploader.destroy(pid);
                            } catch (err) {
                                console.warn(`Cloudinary delete failed for ${pid}:`, err);
                            }
                        })
                    );

                    console.log(`Deleted ${publicIds.length} images from Cloudinary`);
                } catch (err) {
                    console.error("Error deleting images from Cloudinary:", err);
                }
            }

            const deletedItem: any = await ItemModel.findByIdAndDelete(itemId, {
                data: {
                    deletedBy: req.user?._id,
                    deletedAt: Date.now()
                }
            });
            if (!deletedItem) {
                return next(
                    new ApiError(404, "Item not found")
                );
            }

            try {
                const redisKeys = await redis.keys("items:*");
                if (redisKeys.length > 0) {
                    await redis.del(redisKeys);
                    console.log(`Cleared ${redisKeys.length} Redis cache keys`);
                }
            } catch (err) {
                console.error("Redis cache cleanup failed:", err);
            }


            handleResponse(req, res, 200, "Item deleted successfully", deletedItem);
        }
    )

    public static deleteAllItems = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {

            const items = await ItemModel.find({}, { itemImages: 1 });

            if (!items.length) {
                return next(new ApiError(404, "No items found"));
            }


            const publicIds: string[] = [];

            items.forEach(item => {
                if (item.itemImages && item.itemImages.length > 0) {
                    item.itemImages.forEach((url: string) => {
                        const parts = url.split("/");
                        const fileName = parts[parts.length - 1];
                        const publicId = fileName ? fileName.split(".")[0] : "";
                        if (publicId) {
                            publicIds.push(`Epharma/items/${publicId}`);
                        }
                    });
                }
            });

            if (publicIds.length > 0) {
                try {
                    await Promise.all(
                        publicIds.map(pid =>
                            cloudinary.uploader.destroy(pid).catch(err => {
                                console.warn(`Cloudinary delete failed for ${pid}`, err);
                            })
                        )
                    );
                    console.log(`Deleted ${publicIds.length} images from Cloudinary`);
                } catch (err) {
                    console.error("Cloudinary bulk delete failed:", err);
                }
            }

            const deleteResult = await ItemModel.deleteMany({});
            if (!deleteResult.deletedCount) {
                return next(new ApiError(404, "No items found to delete"));
            }

            try {
                const redisKeys = await redis.keys("items:*");
                if (redisKeys.length > 0) {
                    await redis.del(redisKeys);
                    console.log(`Cleared ${redisKeys.length} Redis cache keys`);
                }
            } catch (err) {
                console.error("Redis cache cleanup failed:", err);
            }

            const deleteItemsCount = {
                deletedItems: deleteResult.deletedCount,
                deletedImages: publicIds.length
            }

            handleResponse(req, res, 200, "All items deleted successfully", deleteItemsCount);
        }
    );


    public static getAllItems = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const [page, limit] = [+(req.query.page ?? 1), +(req.query.limit ?? 10)];

            const redisKey = `items:page=${page}:limit=${limit}`;
            const cachedItems = await redis.get(redisKey);
            if (cachedItems) {
                // console.log("Cached Items Found: ", JSON.parse(cachedItems));
                // console.log("limti of items: ", limit);
                // console.log("cached items : ",JSON.parse(cachedItems).length);
                // console.log("cached items : ",cachedItems.length);
                return handleResponse(req, res, 200, "Items retrieved successfully", JSON.parse(cachedItems));
            }

            const items: any = await ItemModel.find()
                .skip((page - 1) * limit)
                .limit(limit);

            console.log("total items : ", items.length);

            if (items.length === 0) {
                return next(
                    new ApiError(404, "No items found")
                );
            }

            await redis.set(redisKey, JSON.stringify(items), { EX: 3600 });

            handleResponse(req, res, 200, "Items retrieved successfully", items);
        }
    )

    public static getItemsByCategory = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const categoryId = req.params.categoryId;
            const [page, limit] = [+(req.query.page ?? 1), +(req.query.limit ?? 10)];

            const redisKey = `items:category=${categoryId}:page=${page}:limit=${limit}`;
            const cachedItems = await redis.get(redisKey);
            if (cachedItems) {
                return handleResponse(req, res, 200, "Items retrieved successfully", JSON.parse(cachedItems));
            }

            const items: any = await ItemModel.find({ itemCategory: categoryId })
                .skip((page - 1) * limit)
                .limit(limit);

            if (items.length === 0) {
                return next(
                    new ApiError(404, "No items found")
                );
            }

            await redis.set(redisKey, JSON.stringify(items), { EX: 3600 });

            handleResponse(req, res, 200, "Items retrieved successfully", items);
        }
    )

    public static getDealsOfTheDay = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const Min_Discount = 40;
            const Max_Deals = 7;

            const cacheKey = `deals:of-the-day`;
            const cachedDeals = await redis.get(cacheKey);

            redis.del(cacheKey);
            if (cachedDeals) {
                //Check if newer deals exist in DB
                const latestDeal = await ItemModel.findOne({ itemDiscount: { $gte: Min_Discount } })
                    .sort({ updatedAt: -1 })
                    .select("updatedAt")
                    .lean();

                // console.log("Latest deal in DB updated at:", latestDeal?.updatedAt);
                // const cacheMeta = JSON.parse(cachedDeals)?.[0]?.updatedAt;

                //     console.log("Cached deals updated at:", cacheMeta); 

                //     if (latestDeal && cacheMeta && new Date(latestDeal.updatedAt ?? 0) > new Date(cacheMeta)) {
                //         console.log("Newer deals found — refreshing cache...");
                //         await redis.del(cacheKey); // Clear old cache
                //     } else {
                //         console.log("Serving deals from cache");
                //         return handleResponse(req, res, 200, "Deals retrieved successfully (cached)", JSON.parse(cachedDeals));
                //     }
            }

            // if (cachedDeals) {
            //     return handleResponse(req, res, 200, "Deals retrieved successfully", JSON.parse(cachedDeals));
            // }

            // Get total count of all deals available
            const totalDeals = await ItemModel.countDocuments({ itemDiscount: { $gte: 40 } });

            const deals = await ItemModel
                .find({ itemDiscount: { $gte: 40 } })
                .sort({ itemDiscount: -1, updatedAt: -1 })
                .limit(Max_Deals)
                .select("_id itemName itemInitialPrice itemDiscount itemGST gstRate itemImages itemCategory itemCompany updatedAt")
                .populate("itemGST")
                .lean();

            if (deals.length === 0) {
                return next(new ApiError(404, "No deals found today"));
            }

            const formattedDeals = deals.map((deal) => {
                const gstRate = (deal.itemGST as any)?.gstRate ?? 0;
                const discountPrice = +(deal.itemInitialPrice * (1 - ((deal.itemDiscount ?? 0) / 100))).toFixed(2);
                const gstAmount = +(discountPrice * (gstRate / 100));
                const finalPrice = +((discountPrice + gstAmount)).toFixed(2);
            
                
                return {
                    _id: deal._id,
                    itemName: deal.itemName,
                    itemInitialPrice: deal.itemInitialPrice,
                    itemDiscount: deal.itemDiscount,
                    itemDescription: deal.itemDescription,
                    gstRate,
                    discountPrice,
                    gstAmount,
                    itemFinalPrice: finalPrice,
                    itemImages: deal.itemImages,
                    itemCategory: deal.itemCategory,
                    itemCompany: deal.itemCompany,
                    updatedAt: deal.updatedAt
                };
            });

            const responseData = {
                deals: formattedDeals,
                totalDeals,
                displayedDeals: formattedDeals.length
            };

            await redis.set(cacheKey, JSON.stringify(responseData), { EX: 21600 });

            return handleResponse(req, res, 200, "Deals fetched successfully", responseData);
        }
    )

    public static addToRecentlyViewedItems = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { itemId } = req.params;
            const userId = req.user?._id;

            if (!itemId) {
                return next(new ApiError(400, "Item ID is required"));
            }

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            // FIFO Logic - Remove if exists to avoid duplicates
            await userModel.findByIdAndUpdate(userId, {
                $pull: { viewedItems: itemId }
            });

            // Add at the end and keep last 15 items
            await userModel.findByIdAndUpdate(userId, {
                $push: {
                    viewedItems: {
                        $each: [itemId],
                        $slice: -15  // Keep last 15 items (FIFO)
                    }
                }
            });

            // Invalidate Redis Cache (use correct key)
            await redis.del(`recently-viewed:${userId}`);

            return handleResponse(req, res, 200, "Recently viewed item updated");
        }
    )

    public static getRecentlyViewedItems = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = req.user?._id;
            if (!userId) {
                return next(new ApiError(401, "Unauthorized"));
            }

            const cacheKey = `recently-viewed:${userId}`;
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return handleResponse(req, res, 200, "Recently viewed items retrieved", JSON.parse(cachedData));
            }

            // First check if user has any viewed items
            const userCheck = await userModel.findById(userId).select('viewedItems').lean();

            if (!userCheck?.viewedItems || userCheck.viewedItems.length === 0) {
                return handleResponse(req, res, 200, "Recently viewed items retrieved", []);
            }

            // Fast aggregation with proper schema structure
            const result = await userModel.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(userId) } },
                {
                    $project: {
                        viewedItems: { $slice: ["$viewedItems", -15] } // Last 15 items
                    }
                },
                { $unwind: { path: "$viewedItems", preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: "items",
                        localField: "viewedItems",
                        foreignField: "_id",
                        as: "itemData"
                    }
                },
                { $unwind: { path: "$itemData", preserveNullAndEmptyArrays: false } },
                {
                    $project: {
                        _id: "$itemData._id",
                        itemName: "$itemData.itemName",
                        itemDescription: "$itemData.itemDescription",
                        itemImages: "$itemData.itemImages",
                        itemFinalPrice: "$itemData.itemFinalPrice"
                    }
                }
            ]);


            // Reverse to show most recent first
            result.reverse();

            await redis.set(cacheKey, JSON.stringify(result), { EX: 600 }); // 10 mins cache

            handleResponse(req, res, 200, "Recently viewed items retrieved", result);
        }
    )

    public static getDynamicFeed = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            const limit = 20;
            const queueKey = `user_feed_queue:${userId}`;

            // 1. Check Queue Length
            const queueLength = await redis.lLen(queueKey);

            if (queueLength < limit) {
                // Regenerate Queue
                const user = await userModel.findById(userId);
                const viewedCategoryIds = user?.viewedCategories || [];

                // Parallel Fetch Strategy
                const [personalizedItems, trendingItems, newItems] = await Promise.all([
                    // A. Personalized (History Match)
                    viewedCategoryIds.length > 0
                        ? ItemModel.find({ itemCategory: { $in: viewedCategoryIds } })
                            .sort({ views: -1 })
                            .limit(50)
                            .select("_id")
                            .lean()
                        : Promise.resolve([]),

                    // B. Trending (High Views)
                    ItemModel.find()
                        .sort({ views: -1 })
                        .limit(50)
                        .select("_id")
                        .lean(),

                    // C. New Arrivals
                    ItemModel.find()
                        .sort({ createdAt: -1 })
                        .limit(50)
                        .select("_id")
                        .lean()
                ]);

                // Merge Unique IDs
                const allIds = new Set([
                    ...personalizedItems.map((i: any) => i._id.toString()),
                    ...trendingItems.map((i: any) => i._id.toString()),
                    ...newItems.map((i: any) => i._id.toString())
                ]);

                // Fisher-Yates Shuffle
                const shuffledIds = Array.from(allIds);
                for (let i = shuffledIds.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
                }

                if (shuffledIds.length > 0) {
                    await redis.rPush(queueKey, shuffledIds);
                    await redis.expire(queueKey, 3600); // 1 Hour TTL
                }
            }

            // 2. Pop Items from Queue (Get next batch)
            const ids = await redis.lRange(queueKey, 0, limit - 1);
            if (ids.length > 0) {
                await redis.lTrim(queueKey, limit, -1);
            }

            if (ids.length === 0) {
                // Fallback if empty even after regeneration attempt (e.g. no items in DB)
                return handleResponse(req, res, 200, "Feed updated", []);
            }

            // 3. Fetch Item Details
            const items = await ItemModel.find({ _id: { $in: ids } })
                .select("itemName code itemImages itemDescription itemDiscount itemRatings itemFinalPrice itemInitialPrice views")
                .lean();

            // 4. Preserve Shuffled Order & Format
            const itemMap = new Map(items.map((i: any) => [i._id.toString(), i]));
            const formattedFeed = ids
                .map(id => itemMap.get(id))
                .filter(item => !!item)
                .map((item: any) => ({
                    _id: item._id,
                    itemName: item.itemName,
                    code: item.code,
                    image: item.itemImages?.[0] || null, // First index only
                    itemDescription: item.itemDescription,
                    itemDiscount: item.itemDiscount,
                    itemRatings: item.itemRatings,
                    itemFinalPrice: item.itemFinalPrice,
                    itemInitialPrice: item.itemInitialPrice
                }));

            return handleResponse(req, res, 200, "Dynamic feed fetched successfully", formattedFeed);
        }
    )

    public static getAITrendingProducts = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            let userId = (req as any).user?._id;

            // --- 1. Fetch User Profile (if logged in) ---
            let userProfile: any = null;
            if (userId) {
                userProfile = await userModel.findById(userId)
                    .select("viewedCategories viewedItems itemsPurchased age address.location wishlist")
                    .lean();
            }

            const userCacheKey = userId ? `user_trend_cache_v2:${userId}` : null;
            if (userCacheKey) {
                const cachedUserTrend = await redis.get(userCacheKey);
                if (cachedUserTrend) {
                    return handleResponse(req, res, 200, "AI Trending products (Cached)", JSON.parse(cachedUserTrend));
                }
            }

            // --- 2. Global Candidates (Base Layer - Cached 1h) ---
            const globalCacheKey = "global_ai_candidates_v4";
            let globalCandidates: any[] = [];
            const cachedGlobals = await redis.get(globalCacheKey);

            if (cachedGlobals) {
                globalCandidates = JSON.parse(cachedGlobals);
            } else {
                // Optimized Aggregation Pipeline: Fetch enough candidates for scoring
                globalCandidates = await ItemModel.aggregate([
                    {
                        $match: { deletedAt: { $exists: false } } // Correctly filter active items
                    },
                    {
                        $sort: { views: -1, itemRatings: -1, createdAt: -1 } // Prioritize popular items
                    },
                    { $limit: 50 }, // Pool size for scoring engine
                    {
                        $project: {
                            _id: 1,
                            itemName: 1,
                            itemDescription: 1,
                            itemRatings: 1,
                            itemFinalPrice: 1, // Added for frontend
                            // Performance: Slice image array in DB
                            itemImages: { $slice: ["$itemImages", 1] },
                            // Scoring Signals
                            itemCategory: 1,
                            views: 1,
                            itemDiscount: 1
                        }
                    }
                ]);
                await redis.set(globalCacheKey, JSON.stringify(globalCandidates), { EX: 3600 });
            }

            // --- 3. AI Scoring Engine (In-Memory Microservice Logic) ---
            const scoredItems = globalCandidates.map(item => {
                let score = 0;

                // A. User Affinity (Weight: 45%)
                if (userProfile) {
                    if (userProfile.viewedCategories?.some((c: any) => c.toString() === item.itemCategory?.toString())) {
                        score += 30;
                    }
                }

                // B. Global Trend Signals (Weight: 25%)
                if ((item.views || 0) > 100) score += 15;
                if ((item.itemDiscount || 0) > 20) score += 10;

                // C. Product Quality (Weight: 15%)
                if ((item.itemRatings || 0) >= 4.5) score += 15;

                // D. Seasonality (Weight: 15%)
                // (Simplified Regex Logic)
                const currentMonth = new Date().getMonth();
                const isWinter = [10, 11, 0, 1].includes(currentMonth);
                const nameLower = (item.itemName || "").toLowerCase();

                if (isWinter && (nameLower.includes("code") || nameLower.includes("syrup"))) score += 20; // Example keywords

                return { ...item, finalScore: score };
            });

            // --- 4. Final Sort & Strict Formatting ---
            scoredItems.sort((a, b) => b.finalScore - a.finalScore);

            if (scoredItems.length > 5) {
                const rand = Math.random();
                if (rand > 0.5) [scoredItems[0], scoredItems[1]] = [scoredItems[1], scoredItems[0]];
            }

            // Strictly requested fields: id, name, description, image, rating
            const formattedResponse = scoredItems.slice(0, 20).map(i => ({
                _id: i._id,
                itemName: i.itemName,
                itemDescription: i.itemDescription || "",
                image: i.itemImages?.[0] || null,
                itemRatings: i.itemRatings || 0,
                itemFinalPrice: i.itemFinalPrice || 0,
                itemDiscount: i.itemDiscount || 0,
            }));

            // Cache for User (10 mins)
            if (userCacheKey) {
                await redis.set(userCacheKey, JSON.stringify(formattedResponse), { EX: 600 });
            }

            return handleResponse(req, res, 200, "AI Trending Products", formattedResponse);
        }
    )

    public static getItemDetails = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { itemId } = req.params;

            if (!itemId) {
                return next(new ApiError(400, "Item ID is required"));
            }

            // 1. Check Cache
            const cacheKey = `item_details:${itemId}`;
            const cachedItem = await redis.get(cacheKey);

            if (cachedItem) {
                // Async View Increment (Fire & Forget)
                ItemModel.findByIdAndUpdate(itemId, { $inc: { views: 1 } }).exec();
                return handleResponse(req, res, 200, "Item details fetched (Cached)", JSON.parse(cachedItem));
            }

            // 2. High-Performance Aggregation Pipeline
            const itemData = await ItemModel.aggregate([
                {
                    $match: { _id: new mongoose.Types.ObjectId(itemId) }
                },
                // Join Category
                {
                    $lookup: {
                        from: "categories", // Collection name
                        localField: "itemCategory",
                        foreignField: "_id",
                        as: "categoryDetails"
                    }
                },
                { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
                // Join Parent Unit
                {
                    $lookup: {
                        from: "parentunits",
                        localField: "itemParentUnit",
                        foreignField: "_id",
                        as: "parentUnitDetails"
                    }
                },
                { $unwind: { path: "$parentUnitDetails", preserveNullAndEmptyArrays: true } },
                // Join Child Unit
                {
                    $lookup: {
                        from: "childunits",
                        localField: "itemChildUnit",
                        foreignField: "_id",
                        as: "childUnitDetails"
                    }
                },
                { $unwind: { path: "$childUnitDetails", preserveNullAndEmptyArrays: true } },
                // Join GST
                {
                    $lookup: {
                        from: "gsts",
                        localField: "itemGST",
                        foreignField: "_id",
                        as: "gstDetails"
                    }
                },
                { $unwind: { path: "$gstDetails", preserveNullAndEmptyArrays: true } },
                // Final Projection (Strict & Clean)
                {
                    $project: {
                        _id: 1,
                        itemName: 1,
                        itemDescription: 1,
                        itemInitialPrice: 1,
                        itemFinalPrice: 1,
                        itemImages: 1,
                        itemCompany: 1,
                        itemBatchNumber: 1,
                        itemDiscount: 1,
                        itemRatings: 1,
                        views: 1,
                        code: 1,
                        HSNCode: 1,
                        formula: 1,
                        weight: 1,
                        itemMfgDate: 1,
                        itemExpiryDate: 1,
                        isTrending: 1,
                        otherInformation: 1,
                        category: {
                            _id: "$categoryDetails._id",
                            name: "$categoryDetails.name",
                            description: "$categoryDetails.description",
                            imageUrl: "$categoryDetails.imageUrl"
                        },
                        units: {
                            parent: {
                                _id: "$parentUnitDetails._id",
                                name: "$parentUnitDetails.name"
                            },
                            child: {
                                _id: "$childUnitDetails._id",
                                name: "$childUnitDetails.name",
                                conversionFactor: "$childUnitDetails.conversionFactor"
                            }
                        },
                        gst: {
                            id: "$gstDetails._id",
                            rate: "$gstDetails.gstRate"
                        }
                    }
                }
            ]);

            const item = itemData[0];

            if (!item) {
                return next(new ApiError(404, "Item not found"));
            }

            // 3. Increment Views (DB Side)
            ItemModel.findByIdAndUpdate(itemId, { $inc: { views: 1 } }).exec();

            // 4. Cache Result (30 Minutes)
            await redis.set(cacheKey, JSON.stringify(item), { EX: 1800 });

            return handleResponse(req, res, 200, "Item details fetched successfully", item);
        }
    )
}
