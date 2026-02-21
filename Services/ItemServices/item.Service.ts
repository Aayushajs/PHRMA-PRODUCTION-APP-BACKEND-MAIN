/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Service - Business logic for Item/Product management.           │
│  Handles creation, updates, retrieval, deals, and image uploads.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../../Utils/catchAsyncErrors";
import { ApiError } from "../../Utils/ApiError";
import { handleResponse } from "../../Utils/handleResponse";
import { redis } from "../../config/redis";
import ItemModel from "../../Databases/Models/item.Model"
import userModel from "../../Databases/Models/user.Models";
import ChildUnitModel from "../../Databases/Models/childUnit.model";
import ParentUnitModel from "../../Databases/Models/parentUnit.model";
import { uploadToCloudinary } from "../../Utils/cloudinaryUpload";
import { v2 as cloudinary } from "cloudinary";
import { gstModel } from '../../Databases/Models/gst.Model'
import mongoose from "mongoose";
import { MRPVerificationService } from './mrpVerification.Service';
import crypto from 'crypto';
import { getTimeAgo } from "../../Utils/timerHelperFn";
import { emitRecentlyViewedUpdate, emitNewProductAdded, emitWishlistUpdate } from '../../Utils/socketEmitters';



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

            // Emit real-time event for new product
            emitNewProductAdded({
                _id: newItem._id,
                itemName: newItem.itemName,
                itemFinalPrice: newItem.itemFinalPrice,
                itemDiscount: newItem.itemDiscount,
                itemCategory: newItem.itemCategory,
                image: newItem.itemImages?.[0] || null
            });

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

            // Emit real-time event for new premium product
            emitNewProductAdded({
                _id: newItem._id,
                itemName: newItem.itemName,
                itemFinalPrice: newItem.itemFinalPrice,
                itemDiscount: newItem.itemDiscount,
                itemCategory: newItem.itemCategory,
                image: newItem.itemImages?.[0] || null,
                isPremium: true
            });

            return handleResponse(req, res, 201, "Item created successfully", newItem);
        }
    )

    public static updateItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const { itemId } = req.params;
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

            let { itemFinalPrice } = existingItem;
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
            const { itemId } = req.params;

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

            const {
                page = 1,
                limit = 20,
                category,
                company,
                minPrice,
                maxPrice,
                priceRange,
                minDiscount,
                minRating,
                formula,
                HSNCode,
                search,
                sortBy = 'createdAt',
                order = 'desc',
                isTrending,
                inStock,

            } = req.query;

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(100, parseInt(limit as string) || 20);
            const skip = (pageNum - 1) * limitNum;

            const filterQuery: any = {
                deletedAt: { $exists: false } // Only active items
            };

            if (category) {
                const categoryIds = (category as string).split(',')
                    .filter(id => mongoose.isValidObjectId(id))
                    .map(id => new mongoose.Types.ObjectId(id));

                if (categoryIds.length > 0) {
                    filterQuery.itemCategory = { $in: categoryIds };
                }
            }

            // Company filter (case-insensitive)
            if (company) {
                filterQuery.itemCompany = {
                    $regex: new RegExp(company as string, 'i')
                };
            }

            // Price filters
            if (minPrice || maxPrice) {
                filterQuery.itemFinalPrice = {};
                if (minPrice) {
                    filterQuery.itemFinalPrice.$gte = parseFloat(minPrice as string);
                }
                if (maxPrice) {
                    filterQuery.itemFinalPrice.$lte = parseFloat(maxPrice as string);
                }
            }

            // Predefined price ranges
            if (priceRange) {
                const range = priceRange as string;
                if (range === '0-100') {
                    filterQuery.itemFinalPrice = { $gte: 0, $lte: 100 };
                } else if (range === '100-500') {
                    filterQuery.itemFinalPrice = { $gte: 100, $lte: 500 };
                } else if (range === '500-1000') {
                    filterQuery.itemFinalPrice = { $gte: 500, $lte: 1000 };
                } else if (range === '1000+') {
                    filterQuery.itemFinalPrice = { $gte: 1000 };
                }
            }

            // Discount filter
            if (minDiscount) {
                filterQuery.itemDiscount = {
                    $gte: parseFloat(minDiscount as string)
                };
            }

            // Rating filter
            if (minRating) {
                filterQuery.itemRatings = {
                    $gte: parseFloat(minRating as string)
                };
            }

            // Medicine-specific filters
            if (formula) {
                filterQuery.formula = {
                    $regex: new RegExp(formula as string, 'i')
                };
            }

            if (HSNCode) {
                filterQuery.HSNCode = HSNCode;
            }

            // Trending filter
            if (isTrending === 'true') {
                filterQuery.isTrending = true;
            }

            // Search filter (searches in name, description, company)
            if (search) {
                const searchRegex = new RegExp(search as string, 'i');
                filterQuery.$or = [
                    { itemName: searchRegex },
                    { itemDescription: searchRegex },
                    { itemCompany: searchRegex },
                    { formula: searchRegex }
                ];
            }

            const cacheKey = `items:filtered:${crypto.createHash('md5')
                .update(JSON.stringify({
                    ...filterQuery,
                    page: pageNum,
                    limit: limitNum,
                    sortBy,
                    order
                }))
                .digest('hex')}`;

            // Check cache
            const cachedItems = await redis.get(cacheKey);
            if (cachedItems) {
                return handleResponse(
                    req,
                    res,
                    200,
                    "Items retrieved from cache",
                    JSON.parse(cachedItems)
                );
            }

            // ============================================================
            // SORT CONFIGURATION - O(1)
            // ============================================================
            const sortOrder = order === 'asc' ? 1 : -1;
            const sortConfig: any = {};

            // Validate sortBy field
            const validSortFields = [
                'itemName', 'itemFinalPrice', 'itemInitialPrice',
                'itemDiscount', 'itemRatings', 'views', 'createdAt',
                'updatedAt', 'itemCompany'
            ];

            if (validSortFields.includes(sortBy as string)) {
                sortConfig[sortBy as string] = sortOrder;
            } else {
                sortConfig.createdAt = -1; // Default sort
            }


            const pipeline: any[] = [
                { $match: filterQuery },

                {
                    $lookup: {
                        from: 'categories',
                        localField: 'itemCategory',
                        foreignField: '_id',
                        as: 'categoryDetails'
                    }
                },
                { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },

                { $sort: sortConfig },

                {
                    $facet: {
                        items: [
                            { $skip: skip },
                            { $limit: limitNum },
                            {
                                $project: {
                                    _id: 1,
                                    itemName: 1,
                                    code: 1,
                                    itemDescription: 1,
                                    itemImages: 1,
                                    itemInitialPrice: 1,
                                    itemFinalPrice: 1,
                                    itemDiscount: 1,
                                    itemCompany: 1,
                                    itemRatings: 1,
                                    views: 1,
                                    isTrending: 1,
                                    formula: 1,
                                    HSNCode: 1,
                                    weight: 1,
                                    itemMfgDate: 1,
                                    itemExpiryDate: 1,
                                    createdAt: 1,
                                    category: {
                                        _id: '$categoryDetails._id',
                                        name: '$categoryDetails.name',
                                        imageUrl: '$categoryDetails.imageUrl'
                                    }
                                }
                            }
                        ],
                        totalCount: [{ $count: 'count' }],

                        // Aggregated statistics
                        stats: [
                            {
                                $group: {
                                    _id: null,
                                    avgPrice: { $avg: '$itemFinalPrice' },
                                    minPrice: { $min: '$itemFinalPrice' },
                                    maxPrice: { $max: '$itemFinalPrice' },
                                    avgRating: { $avg: '$itemRatings' },
                                    totalViews: { $sum: '$views' }
                                }
                            }
                        ]
                    }
                }
            ];

            const [result] = await ItemModel.aggregate(pipeline);

            const totalItems = result?.totalCount[0]?.count || 0;
            const items = result?.items || [];
            const stats = result?.stats[0] || {};


            const responseData = {
                items,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalItems / limitNum),
                    totalItems,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < Math.ceil(totalItems / limitNum),
                    hasPrevPage: pageNum > 1
                },
                filters: {
                    applied: {
                        category: category || null,
                        company: company || null,
                        priceRange: (minPrice || maxPrice) ? { min: minPrice, max: maxPrice } : null,
                        minDiscount: minDiscount || null,
                        minRating: minRating || null,
                        search: search || null,
                        isTrending: isTrending || null
                    }
                },
                stats: {
                    avgPrice: stats.avgPrice ? Math.round(stats.avgPrice * 100) / 100 : 0,
                    priceRange: {
                        min: stats.minPrice || 0,
                        max: stats.maxPrice || 0
                    },
                    avgRating: stats.avgRating ? Math.round(stats.avgRating * 10) / 10 : 0,
                    totalViews: stats.totalViews || 0
                },
                meta: {
                    sortBy,
                    order,
                    complexity: 'O(n)',
                    cached: false
                }
            };

            // Cache for 10 minutes
            await redis.set(cacheKey, JSON.stringify(responseData), { EX: 600 });

            return handleResponse(
                req,
                res,
                200,
                "Items retrieved successfully",
                responseData
            );
        }
    )

    public static getItemsByCategory = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const { categoryId } = req.params;
            const {
                page = 1,
                limit = 20,
                minPrice,
                maxPrice,
                minRating,
                minDiscount,
                isTrending,
                sortBy = 'createdAt',
                order = 'desc'
            } = req.query;

            if (!mongoose.isValidObjectId(categoryId)) {
                return next(new ApiError(400, "Invalid category ID"));
            }

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(100, parseInt(limit as string) || 20);
            const skip = (pageNum - 1) * limitNum;

            // Build filter query - Convert categoryId to ObjectId
            const filterQuery: any = {
                itemCategory: new mongoose.Types.ObjectId(categoryId),
                deletedAt: { $exists: false }
            };

            // console.log("Initial filter query:", filterQuery);

            // Price filters
            if (minPrice || maxPrice) {
                filterQuery.itemFinalPrice = {};
                if (minPrice) {
                    filterQuery.itemFinalPrice.$gte = parseFloat(minPrice as string);
                }
                if (maxPrice) {
                    filterQuery.itemFinalPrice.$lte = parseFloat(maxPrice as string);
                }
            }

            // Rating filter
            if (minRating) {
                filterQuery.itemRatings = {
                    $gte: parseFloat(minRating as string)
                };
            }

            // Discount filter
            if (minDiscount) {
                filterQuery.itemDiscount = {
                    $gte: parseFloat(minDiscount as string)
                };
            }

            // Trending filter
            if (isTrending === 'true') {
                filterQuery.isTrending = true;
            }

            const cacheKey = `items:category:${categoryId}:${crypto.createHash('md5')
                .update(JSON.stringify({ 
                    ...filterQuery, 
                    page: pageNum, 
                    limit: limitNum,
                    sortBy,
                    order 
                }))
                .digest('hex')}`;

            const cachedItems = await redis.get(cacheKey);
            if (cachedItems) {
                return handleResponse(req, res, 200, "Items retrieved from cache", JSON.parse(cachedItems));
            }

            // Sort configuration
            const sortOrder = order === 'asc' ? 1 : -1;
            const sortConfig: any = {};

            const validSortFields = [
                'itemName', 'itemFinalPrice', 'itemInitialPrice', 
                'itemDiscount', 'itemRatings', 'views', 'createdAt', 
                'updatedAt', 'itemCompany'
            ];

            if (validSortFields.includes(sortBy as string)) {
                sortConfig[sortBy as string] = sortOrder;
            } else {
                sortConfig.createdAt = -1;
            }

            // Aggregation pipeline
            const pipeline: any[] = [
                { $match: filterQuery },

                {
                    $lookup: {
                        from: 'categories',
                        localField: 'itemCategory',
                        foreignField: '_id',
                        as: 'categoryDetails'
                    }
                },
                { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },

                { $sort: sortConfig },

                {
                    $facet: {
                        items: [
                            { $skip: skip },
                            { $limit: limitNum },
                            {
                                $project: {
                                    _id: 1,
                                    itemName: 1,
                                    code: 1,
                                    itemDescription: 1,
                                    itemImages: 1,
                                    itemInitialPrice: 1,
                                    itemFinalPrice: 1,
                                    itemDiscount: 1,
                                    itemCompany: 1,
                                    itemRatings: 1,
                                    views: 1,
                                    isTrending: 1,
                                    formula: 1,
                                    HSNCode: 1,
                                    weight: 1,
                                    itemMfgDate: 1,
                                    itemExpiryDate: 1,
                                    createdAt: 1,
                                    category: {
                                        _id: '$categoryDetails._id',
                                        name: '$categoryDetails.name',
                                        imageUrl: '$categoryDetails.imageUrl'
                                    }
                                }
                            }
                        ],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ];

            const [result] = await ItemModel.aggregate(pipeline);

            const totalItems = result?.totalCount[0]?.count || 0;
            let items = result?.items || [];

            // O(n) Fisher-Yates Shuffle - Randomize items
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [items[i], items[j]] = [items[j], items[i]];
            }

            const responseData = {
                items,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalItems / limitNum),
                    totalItems,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < Math.ceil(totalItems / limitNum),
                    hasPrevPage: pageNum > 1
                },
                filters: {
                    applied: {
                        categoryId,
                        priceRange: (minPrice || maxPrice) ? { min: minPrice, max: maxPrice } : null,
                        minRating: minRating || null,
                        minDiscount: minDiscount || null,
                        isTrending: isTrending || null
                    }
                }
            };

            // console.log("Response data prepared:", responseData);
            // Cache the result (even if empty) to prevent repeated DB queries
            await redis.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });

            handleResponse(req, res, 200, "Items retrieved successfully", responseData);
        }
    )

    // public static getItemsByCategory = catchAsyncErrors(
    //     async (req: Request, res: Response, next: NextFunction) => {

    //         const { categoryId } = req.params;

    //         const {
    //             page = 1,
    //             limit = 20,
    //             minPrice,
    //             maxPrice,
    //             minRating,
    //             minDiscount,
    //             isTrending,
    //             sortBy = 'createdAt',
    //             order = 'desc'
    //         } = req.query;

    //         if (!mongoose.isValidObjectId(categoryId)) {
    //             return next(new ApiError(400, "Invalid category ID"));
    //         }

    //         const pageNum = parseInt(page as string) || 1;
    //         const limitNum = Math.min(100, parseInt(limit as string) || 20);
    //         const skip = (pageNum - 1) * limitNum;

    //         const filterQuery: any = {
    //             itemCategory: new mongoose.Types.ObjectId(categoryId),
    //             deletedAt: { $exists: false }
    //         };

    //         if (minPrice || maxPrice) {
    //             filterQuery.itemFinalPrice = {};
    //             if (minPrice) filterQuery.itemFinalPrice.$gte = +minPrice;
    //             if (maxPrice) filterQuery.itemFinalPrice.$lte = +maxPrice;
    //         }

    //         if (minRating) filterQuery.itemRatings = { $gte: +minRating };
    //         if (minDiscount) filterQuery.itemDiscount = { $gte: +minDiscount };
    //         if (isTrending === 'true') filterQuery.isTrending = true;

    //         // const cacheKey = `items:${categoryId}:${pageNum}:${limitNum}`;

    //         // const cached = await redis.get(cacheKey);
    //         // if (cached) {
    //         //     return handleResponse(req, res, 200, "From cache", JSON.parse(cached));
    //         // }

    //         const sortOrder = order === 'asc' ? 1 : -1;

    //         const sortConfig: any = {
    //             [sortBy as string]: sortOrder
    //         };

    //         const pipeline: any[] = [
    //             { $match: filterQuery },
    //             { $sort: sortConfig },
    //             { $skip: skip },
    //             { $limit: limitNum },
    //             {
    //                 $lookup: {
    //                     from: 'categories',
    //                     localField: 'itemCategory',
    //                     foreignField: '_id',
    //                     as: 'categoryDetails'
    //                 }
    //             },
    //             { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },
    //             {
    //                 $project: {
    //                     itemName: 1,
    //                     itemFinalPrice: 1,
    //                     itemDiscount: 1,
    //                     itemRatings: 1,
    //                     views: 1,
    //                     createdAt: 1,
    //                     category: {
    //                         _id: '$categoryDetails._id',
    //                         name: '$categoryDetails.name'
    //                     }
    //                 }
    //             }
    //         ];

    //         const [items, totalItems] = await Promise.all([
    //             ItemModel.aggregate(pipeline),
    //             ItemModel.countDocuments(filterQuery)
    //         ]);

    //         const responseData = {
    //             items,
    //             pagination: {
    //                 currentPage: pageNum,
    //                 totalPages: Math.ceil(totalItems / limitNum),
    //                 totalItems
    //             }
    //         };

    //         // await redis.set(cacheKey, JSON.stringify(responseData), { EX: 3600 });

    //         handleResponse(req, res, 200, "Items fetched", responseData);
    //     }
    // );


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

    /**
    * Logic:
    * - If itemId starts with "wishlistitem" → Add to wishlist (LIFO - most recent at top)
    * - Otherwise → Add to recently viewed (FIFO - maintain last 15)
    */
    public static addToRecentlyViewedItems = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { itemId } = req.body;
            const userId = req.user?._id;

            if (!itemId || typeof itemId !== 'string') {
                return next(new ApiError(400, "Item ID is required in request body"));
            }

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }


            const isWishlistOperation = itemId.startsWith('wishlistitem');

            let actualItemId: string;

            if (isWishlistOperation) {
                // Extract actual itemId: "wishlistitem64abc..." → "64abc..."
                actualItemId = itemId.replace(/^wishlistitem/, '');

                if (!mongoose.isValidObjectId(actualItemId)) {
                    return next(new ApiError(400, "Invalid item ID format after wishlistitem prefix"));
                }

                const itemCacheKey = `item:exists:${actualItemId}`;
                let itemExists = await redis.get(itemCacheKey);

                if (!itemExists) {
                    const item = await ItemModel.findById(actualItemId).select('_id').lean();
                    if (!item) {
                        return next(new ApiError(404, "Item not found"));
                    }
                    itemExists = 'true';
                    await redis.set(itemCacheKey, itemExists, { EX: 3600 });
                }

                // Atomic Operation 1: Remove if already exists (for re-positioning)
                await userModel.findByIdAndUpdate(userId, {
                    $pull: { wishlist: actualItemId }
                });

                // Atomic Operation 2: Add to beginning (index 0) - LIFO
                await userModel.findByIdAndUpdate(userId, {
                    $push: {
                        wishlist: {
                            $each: [actualItemId],
                            $position: 0  // Add at index 0 (top of stack)
                        }
                    }
                });

                // Invalidate wishlist caches
                const wishlistPattern = `user:wishlist:${userId}*`;
                const keys = await redis.keys(wishlistPattern);
                if (keys.length > 0) {
                    await Promise.all(keys.map(key => redis.del(key)));
                }

                // Get item details for WebSocket event
                const item = await ItemModel.findById(actualItemId)
                    .select('_id itemName itemFinalPrice itemDiscount itemImages')
                    .lean();

                if (item) {
                    // Emit real-time WebSocket event
                    emitWishlistUpdate(userId.toString(), 'added', {
                        _id: item._id,
                        itemName: item.itemName,
                        itemFinalPrice: item.itemFinalPrice,
                        itemDiscount: item.itemDiscount,
                        image: (item as any).itemImages?.[0] || null
                    });
                }

                return handleResponse(
                    req,
                    res,
                    200,
                    "Item added to wishlist successfully (LIFO - at top)",
                    {
                        operation: "wishlist",
                        itemId: actualItemId,
                        position: "top"
                    }
                );

            } else {
                actualItemId = itemId;

                if (!mongoose.isValidObjectId(actualItemId)) {
                    return next(new ApiError(400, "Invalid item ID format"));
                }

                await userModel.findByIdAndUpdate(userId, {
                    $pull: { viewedItems: actualItemId }
                });

                // Step 2: Enqueue - Add at the end and maintain queue size of 15
                await userModel.findByIdAndUpdate(userId, {
                    $push: {
                        viewedItems: {
                            $each: [actualItemId],
                            $slice: -15  // Keep last 15 items (FIFO queue)
                        }
                    }
                });

                // Invalidate cache
                await redis.del(`recently-viewed:${userId}`);

                // Emit real-time update for recently viewed
                const viewedItem = await ItemModel.findById(actualItemId)
                    .select('_id itemName itemFinalPrice itemDiscount itemImages')
                    .lean();

                if (viewedItem) {
                    emitRecentlyViewedUpdate(userId.toString(), {
                        _id: viewedItem._id,
                        itemName: viewedItem.itemName,
                        itemFinalPrice: viewedItem.itemFinalPrice,
                        itemDiscount: viewedItem.itemDiscount,
                        image: (viewedItem as any).itemImages?.[0] || null
                    });
                }

                return handleResponse(
                    req,
                    res,
                    200,
                    "Item added to recently viewed (FIFO queue)",
                    {
                        operation: "recently_viewed",
                        itemId: actualItemId,
                        queueSize: 15
                    }
                );
            }
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
            }
            
            // Fetch fresh candidates if cache is empty or doesn't exist
            if (globalCandidates.length === 0) {
                // Optimized Aggregation Pipeline: Fetch enough candidates for scoring
                globalCandidates = await ItemModel.aggregate([
                    {
                        $match: {} // No restrictive filters - get all active items
                    },
                    {
                        $sort: { views: -1, itemRatings: -1, createdAt: -1 } // Prioritize popular items
                    },
                    { $limit: 100 }, // Increased pool size for better variety
                    {
                        $project: {
                            _id: 1,
                            itemName: 1,
                            itemDescription: 1,
                            itemRatings: 1,
                            itemFinalPrice: 1,
                            itemImages: { $slice: ["$itemImages", 1] },
                            itemCategory: 1,
                            views: 1,
                            itemDiscount: 1,
                            createdAt: 1
                        }
                    }
                ]);
                
                // Only cache if we have results
                if (globalCandidates.length > 0) {
                    await redis.set(globalCacheKey, JSON.stringify(globalCandidates), { EX: 3600 });
                }
            }

            // Safety check - if still no items, return empty array
            if (!globalCandidates || globalCandidates.length === 0) {
                return handleResponse(req, res, 200, "AI Trending Products", []);
            }

            // --- 3. AI Scoring Engine (In-Memory Microservice Logic) ---
            const scoredItems = globalCandidates.map(item => {
                let score = 100; // Base score to ensure ranking even for new items

                // A. User Affinity (Weight: 45%)
                if (userProfile && userProfile.viewedCategories?.some((c: any) => c.toString() === item.itemCategory?.toString())) {
                    score += 45;
                }

                // B. Global Trend Signals (Weight: 25%)
                const viewScore = Math.min((item.views || 0) / 10, 15); // Normalize views
                score += viewScore;
                
                if ((item.itemDiscount || 0) > 20) score += 10;

                // C. Product Quality (Weight: 15%)
                const ratingScore = Math.min(((item.itemRatings || 0) / 5) * 15, 15); // Normalize rating
                score += ratingScore;

                // D. Recency Boost (Weight: 5%)
                const ageInDays = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                if (ageInDays < 7) score += 5; // Recent items get small boost

                return { ...item, finalScore: score };
            });

            // --- 4. Fisher-Yates Shuffle for True Randomization ---
            const shuffled = [...scoredItems];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Strictly requested fields: id, name, description, image, rating (Max 15 items)
            const formattedResponse = shuffled.slice(0, 15).map(i => ({
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



    /**
     * Remove item from wishlist
     */
    public static removeFromWishlist = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { itemId } = req.params;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            if (!itemId || !mongoose.isValidObjectId(itemId)) {
                return next(new ApiError(400, "Valid item ID is required"));
            }

            // Atomic remove operation
            const updateResult = await userModel.findByIdAndUpdate(
                userId,
                {
                    $pull: { wishlist: itemId }
                },
                { new: true, select: 'wishlist' }
            );

            if (!updateResult) {
                return next(new ApiError(404, "User not found"));
            }

            // Clear cache
            const wishlistCacheKey = `user:wishlist:${userId}`;
            await redis.del(wishlistCacheKey);

            // Get item details for WebSocket event
            const item = await ItemModel.findById(itemId)
                .select('_id itemName itemFinalPrice itemDiscount itemImages')
                .lean();

            if (item) {
                // Emit real-time WebSocket event
                emitWishlistUpdate(userId.toString(), 'removed', {
                    _id: item._id,
                    itemName: item.itemName,
                    itemFinalPrice: item.itemFinalPrice,
                    itemDiscount: item.itemDiscount,
                    image: (item as any).itemImages?.[0] || null
                });
            }

            return handleResponse(
                req,
                res,
                200,
                "Item removed from wishlist successfully",
                {
                    wishlistCount: updateResult.wishlist?.length || 0,
                    itemId
                }
            );
        }
    );

    /**
     * Get user's wishlist with full item details (cached for performance)
     */
    public static getWishlist = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { page = 1, limit = 20 } = req.query;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(50, parseInt(limit as string) || 20);
            const skip = (pageNum - 1) * limitNum;

            const wishlistCacheKey = `user:wishlist:${userId}:p${pageNum}:l${limitNum}`;

            // Check cache first
            const cachedWishlist = await redis.get(wishlistCacheKey);
            if (cachedWishlist) {
                return handleResponse(
                    req,
                    res,
                    200,
                    "Wishlist fetched from cache",
                    JSON.parse(cachedWishlist)
                );
            }

            // Optimized aggregation pipeline
            const result = await userModel.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(userId) } },
                {
                    $project: {
                        wishlist: { $slice: ["$wishlist", skip, limitNum] },
                        totalCount: { $size: "$wishlist" }
                    }
                },
                { $unwind: { path: "$wishlist", preserveNullAndEmptyArrays: false } },
                {
                    $addFields: {
                        wishlistItemId: { $toObjectId: "$wishlist" }
                    }
                },
                {
                    $lookup: {
                        from: "items",
                        localField: "wishlistItemId",
                        foreignField: "_id",
                        as: "itemData"
                    }
                },
                { $unwind: { path: "$itemData", preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: "categories",
                        localField: "itemData.itemCategory",
                        foreignField: "_id",
                        as: "categoryData"
                    }
                },
                { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: "$_id",
                        totalCount: { $first: "$totalCount" },
                        items: {
                            $push: {
                                _id: "$itemData._id",
                                itemName: "$itemData.itemName",
                                itemDescription: "$itemData.itemDescription",
                                itemImages: "$itemData.itemImages",
                                itemInitialPrice: "$itemData.itemInitialPrice",
                                itemFinalPrice: "$itemData.itemFinalPrice",
                                itemDiscount: "$itemData.itemDiscount",
                                itemCompany: "$itemData.itemCompany",
                                itemRatings: "$itemData.itemRatings",
                                isTrending: "$itemData.isTrending",
                                category: {
                                    _id: "$categoryData._id",
                                    name: "$categoryData.name",
                                    imageUrl: "$categoryData.imageUrl"
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        items: 1,
                        totalCount: 1,
                        totalPages: {
                            $ceil: { $divide: ["$totalCount", limitNum] }
                        },
                        currentPage: { $literal: pageNum },
                        hasNextPage: {
                            $gt: ["$totalCount", skip + limitNum]
                        }
                    }
                }
            ]);

            const responseData = result[0] || {
                items: [],
                totalCount: 0,
                totalPages: 0,
                currentPage: pageNum,
                hasNextPage: false
            };

            // Cache for 5 minutes
            await redis.set(wishlistCacheKey, JSON.stringify(responseData), { EX: 300 });

            return handleResponse(
                req,
                res,
                200,
                "Wishlist fetched successfully",
                responseData
            );
        }
    );

    /**
     * Check if item is in user's wishlist (fast check)
     */
    public static checkWishlistStatus = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { itemId } = req.params;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            if (!itemId || !mongoose.isValidObjectId(itemId)) {
                return next(new ApiError(400, "Valid item ID is required"));
            }

            // Fast lookup using projection
            const user = await userModel.findById(userId)
                .select('wishlist')
                .lean();

            const isInWishlist = user?.wishlist?.includes(itemId) || false;

            return handleResponse(
                req,
                res,
                200,
                "Wishlist status checked",
                {
                    itemId,
                    isInWishlist
                }
            );
        }
    );

    /**
     * Clear entire wishlist
     */
    public static clearWishlist = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            const updateResult = await userModel.findByIdAndUpdate(
                userId,
                { $set: { wishlist: [] } },
                { new: true, select: 'wishlist' }
            );

            if (!updateResult) {
                return next(new ApiError(404, "User not found"));
            }

            // Clear all wishlist caches for this user
            const pattern = `user:wishlist:${userId}*`;
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await Promise.all(keys.map(key => redis.del(key)));
            }

            // Emit real-time WebSocket event
            emitWishlistUpdate(userId.toString(), 'removed', null);

            return handleResponse(
                req,
                res,
                200,
                "Wishlist cleared successfully",
                { wishlistCount: 0 }
            );
        }
    );

    public static getSimilarProducts = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { itemId } = req.params;
            const { page = 1, limit = 20 } = req.query;

            if (!itemId || !mongoose.isValidObjectId(itemId)) {
                return next(new ApiError(400, "Valid item ID is required"));
            }

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(50, parseInt(limit as string) || 20);
            const skip = (pageNum - 1) * limitNum;

            const cacheKey = `similar_products:${itemId}:p${pageNum}:l${limitNum}`;

            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return handleResponse(
                    req,
                    res,
                    200,
                    "Similar products fetched from cache",
                    JSON.parse(cachedData)
                );
            }

            const sourceProduct = await ItemModel.findById(itemId)
                .select('itemCategory itemFinalPrice itemCompany itemName')
                .lean();

            if (!sourceProduct) {
                return next(new ApiError(404, "Product not found"));
            }

            // Calculate price range (±30% tolerance for similarity)
            const priceMin = sourceProduct.itemFinalPrice * 0.7;
            const priceMax = sourceProduct.itemFinalPrice * 1.3;


            const pipeline: any[] = [
                // Stage 1: Filter similar products (O(n) with indexes)
                {
                    $match: {
                        _id: { $ne: new mongoose.Types.ObjectId(itemId) },
                        itemCategory: sourceProduct.itemCategory,
                        itemFinalPrice: { $gte: priceMin, $lte: priceMax },
                        deletedAt: { $exists: false }
                    }
                },

                // Stage 2: Calculate similarity score (O(n))
                {
                    $addFields: {
                        similarityScore: {
                            $add: [
                                // Score 1: Same company = +50 points
                                {
                                    $cond: [
                                        { $eq: ["$itemCompany", sourceProduct.itemCompany] },
                                        50,
                                        0
                                    ]
                                },
                                // Score 2: Price proximity = up to 30 points
                                {
                                    $multiply: [
                                        30,
                                        {
                                            $subtract: [
                                                1,
                                                {
                                                    $divide: [
                                                        {
                                                            $abs: {
                                                                $subtract: ["$itemFinalPrice", sourceProduct.itemFinalPrice]
                                                            }
                                                        },
                                                        sourceProduct.itemFinalPrice
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                // Score 3: Ratings weight = up to 20 points
                                {
                                    $multiply: ["$itemRatings", 4]
                                }
                            ]
                        }
                    }
                },

                // Stage 3: Sort by similarity score DESC (O(n log n))
                {
                    $sort: {
                        similarityScore: -1,
                        itemRatings: -1,
                        views: -1
                    }
                },

                // Stage 4: Pagination (O(1))
                {
                    $facet: {
                        items: [
                            { $skip: skip },
                            { $limit: limitNum },
                            {
                                $project: {
                                    _id: 1,
                                    itemName: 1,
                                    code: 1,
                                    image: { $arrayElemAt: ["$itemImages", 0] }, // First image only
                                    itemDescription: 1,
                                    itemDiscount: 1,
                                    itemRatings: 1,
                                    itemFinalPrice: 1,
                                    itemInitialPrice: 1,
                                    itemCompany: 1,
                                    views: 1,
                                    similarityScore: 1
                                }
                            }
                        ],
                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ];

            // Execute aggregation pipeline (O(n) total)
            const [result] = await ItemModel.aggregate(pipeline);

            const totalItems = result?.totalCount[0]?.count || 0;
            const items = result?.items || [];

            // Format response (O(k) where k = items.length)
            const responseData = {
                sourceProduct: {
                    _id: sourceProduct._id,
                    itemName: sourceProduct.itemName,
                    itemCategory: sourceProduct.itemCategory,
                    itemFinalPrice: sourceProduct.itemFinalPrice
                },
                items: items.map((item: any) => ({
                    _id: item._id,
                    itemName: item.itemName,
                    code: item.code,
                    image: item.image,
                    itemDescription: item.itemDescription,
                    itemDiscount: item.itemDiscount,
                    itemRatings: item.itemRatings,
                    itemFinalPrice: item.itemFinalPrice,
                    itemInitialPrice: item.itemInitialPrice,
                    itemCompany: item.itemCompany,
                    views: item.views,
                    similarityScore: Math.round(item.similarityScore)
                })),
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalItems / limitNum),
                    totalItems: totalItems,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < Math.ceil(totalItems / limitNum),
                    hasPrevPage: pageNum > 1
                },
                meta: {
                    algorithm: "Multi-factor similarity scoring",
                    factors: ["category", "price_range", "company", "ratings"],
                    priceRange: { min: priceMin, max: priceMax },
                    complexity: "O(n)"
                }
            };

            // Cache for 30 minutes (O(1))
            await redis.set(cacheKey, JSON.stringify(responseData), { EX: 1800 });

            return handleResponse(
                req,
                res,
                200,
                "Similar products fetched successfully",
                responseData
            );
        }
    );

    /**
     * Auto-Suggestion API for Search with Debouncing Support
     * 
     * Features:
     * - Fast response time optimized for debounced frontend calls
     * - Redis caching to reduce database load
     * - Returns lightweight suggestions (name, id, image only)
     * - Supports partial text matching with regex
     * - Rate limiting friendly with short cache TTL
     * - Shows "no results found" with alternative suggestions when no exact match
     * 
     * Frontend should implement debouncing (300-500ms delay) before calling this API
     */
    public static getSearchSuggestions = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { q, limit = 10 } = req.query;

            // Validate search query
            if (!q || typeof q !== 'string') {
                return handleResponse(req, res, 400, "Search query 'q' is required", {
                    suggestions: [],
                    found: false,
                    query: "",
                    message: "Search query is required"
                });
            }

            const searchQuery = q.trim();

            // Minimum 2 characters for suggestions
            if (searchQuery.length < 1) {
                return handleResponse(req, res, 200, "Minimum 2 characters required", {
                    suggestions: [],
                    found: false,
                    query: searchQuery,
                    message: "Please enter at least 2 characters to search"
                });
            }

            const maxLimit = Math.min(parseInt(limit as string) || 10, 20);

            // Generate cache key based on search query (lowercase for consistency)
            const cacheKey = `suggestions:${searchQuery.toLowerCase()}:${maxLimit}`;

            // Check Redis cache first (short TTL for fresh results)
            const cachedSuggestions = await redis.get(cacheKey);
            if (cachedSuggestions) {
                const parsedCache = JSON.parse(cachedSuggestions);
                return handleResponse(req, res, 200,
                    parsedCache.found ? "Suggestions fetched (cached)" : "No results found (cached)",
                    {
                        ...parsedCache,
                        cached: true
                    }
                );
            }

            // Create regex for partial matching (case-insensitive)
            const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedQuery, 'i');

            // Optimized aggregation pipeline for fast suggestions
            const suggestions = await ItemModel.aggregate([
                {
                    $match: {
                        $or: [
                            { itemName: searchRegex },
                            { code: searchRegex },
                            { itemCompany: searchRegex },
                            { formula: searchRegex }
                        ],
                        deletedAt: { $exists: false }
                    }
                },
                {
                    // Prioritize exact matches and matches at the beginning
                    $addFields: {
                        matchScore: {
                            $cond: {
                                if: { $regexMatch: { input: { $toLower: "$itemName" }, regex: `^${searchQuery.toLowerCase()}` } },
                                then: 3, // Exact prefix match gets highest priority
                                else: {
                                    $cond: {
                                        if: { $regexMatch: { input: { $toLower: "$code" }, regex: `^${searchQuery.toLowerCase()}` } },
                                        then: 2, // Code match
                                        else: 1  // Partial match
                                    }
                                }
                            }
                        }
                    }
                },
                { $sort: { matchScore: -1, itemRatings: -1, views: -1, itemName: 1 } },
                { $limit: maxLimit },
                {
                    $project: {
                        _id: 1,
                        itemName: 1,
                        code: 1,
                        itemCompany: 1,
                        image: { $arrayElemAt: ["$itemImages", 0] },
                        itemFinalPrice: 1,
                        itemDiscount: 1,
                        itemRatings: 1
                    }
                }
            ]);

            // Format suggestions for frontend
            const formattedSuggestions = suggestions.map((item: any) => ({
                id: item._id,
                name: item.itemName,
                code: item.code || null,
                company: item.itemCompany || null,
                image: item.image || null,
                price: item.itemFinalPrice || 0,
                discount: item.itemDiscount || 0,
                rating: item.itemRatings || 0
            }));

            // Check if results found
            const found = formattedSuggestions.length > 0;

            let responseData: any = {
                suggestions: formattedSuggestions,
                found,
                query: searchQuery,
                count: formattedSuggestions.length
            };

            // If no results found, provide helpful alternatives
            if (!found) {
                responseData.message = `No results found for "${searchQuery}"`;

                // Try to get popular/trending items as alternatives
                const popularItems = await ItemModel.aggregate([
                    { $match: { deletedAt: { $exists: false } } },
                    { $sort: { views: -1, itemRatings: -1 } },
                    { $limit: 5 },
                    {
                        $project: {
                            _id: 1,
                            itemName: 1,
                            code: 1,
                            itemCompany: 1,
                            image: { $arrayElemAt: ["$itemImages", 0] },
                            itemFinalPrice: 1,
                            itemDiscount: 1,
                            itemRatings: 1
                        }
                    }
                ]);

                responseData.alternativeSuggestions = popularItems.map((item: any) => ({
                    id: item._id,
                    name: item.itemName,
                    code: item.code || null,
                    company: item.itemCompany || null,
                    image: item.image || null,
                    price: item.itemFinalPrice || 0,
                    discount: item.itemDiscount || 0,
                    rating: item.itemRatings || 0
                }));

                responseData.tip = "Try different keywords or check the spelling";
            }

            // Cache for 2 minutes (short TTL for fresh data while reducing load)
            await redis.set(cacheKey, JSON.stringify(responseData), { EX: 120 });

            return handleResponse(
                req,
                res,
                200,
                found ? "Suggestions fetched successfully" : `No results found for "${searchQuery}"`,
                {
                    ...responseData,
                    cached: false
                }
            );
        }
    );

    public static getPopularSearchTerms = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const cacheKey = "popular:search:terms:v2";
            const LIMIT = 10;

            // Check cache first
            const cachedTerms = await redis.get(cacheKey);
            if (cachedTerms) {
                return handleResponse(req, res, 200, "Popular terms fetched (cached)", {
                    terms: JSON.parse(cachedTerms),
                    cached: true
                });
            }

            // O(n) optimized: Single query with lean() for speed
            const popularItems = await ItemModel.find({})
                .select("_id itemName views isTrending")
                .sort({ views: -1, isTrending: -1 })
                .limit(LIMIT)
                .lean()
                .exec();

            // O(n) formatting - safely map
            const terms = popularItems.map((item: any) => ({
                id: item._id,
                term: item.itemName
            }));

            // Cache for 24 hours
            await redis.set(cacheKey, JSON.stringify(terms), { EX: 86400 });

            return handleResponse(req, res, 200, "Popular terms fetched successfully", {
                terms,
                cached: false
            });
        }
    );

    public static saveRecentSearch = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { query, itemId, itemName, itemImage } = req.body;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            if (!query || typeof query !== 'string' || query.trim().length < 2) {
                return next(new ApiError(400, "Valid search query is required (min 2 characters)"));
            }

            const searchQuery = query.trim().toLowerCase();
            const redisKey = `recent:searches:${userId}`;
            const MAX_RECENT_SEARCHES = 10; // Redis can store more
            const MAX_DB_SEARCHES = 7; // Database limit

            const searchEntry = JSON.stringify({
                query: searchQuery,
                displayQuery: query.trim(),
                itemId: itemId || null,
                itemName: itemName || null,
                itemImage: itemImage || null,
                timestamp: Date.now()
            });

            // Remove duplicate from Redis if exists
            const existingSearches = await redis.lRange(redisKey, 0, -1);

            for (let i = 0; i < existingSearches.length; i++) {
                try {
                    const searchItem = existingSearches[i];
                    if (!searchItem) continue;
                    const parsed = JSON.parse(searchItem);
                    if (parsed.query === searchQuery) {
                        await redis.lRem(redisKey, 1, searchItem);
                        break;
                    }
                } catch (e) {
                    // Skip invalid entries
                }
            }

            // Add to Redis (LIFO - latest at top)
            await redis.lPush(redisKey, searchEntry);
            await redis.lTrim(redisKey, 0, MAX_RECENT_SEARCHES - 1);
            await redis.expire(redisKey, 30 * 24 * 60 * 60);

            // Save to Database (FIFO - bottom to top, max 7 items)
            const searchObject = {
                query: searchQuery,
                displayQuery: query.trim(),
                itemId: itemId || null,
                itemName: itemName || null,
                itemImage: itemImage || null,
                timestamp: Date.now()
            };

            // Get current user's recent searches from database
            const user = await userModel.findById(userId).select('recentSearches');

            if (user) {
                let recentSearches = user.recentSearches || [];

                // Remove duplicate if exists
                recentSearches = recentSearches.filter(
                    (search: any) => search.query !== searchQuery
                );

                // Add new search at the beginning (bottom to top - latest first)
                recentSearches.unshift(searchObject);

                // Keep only last 7 items (FIFO - when 8th enters, 1st is removed)
                if (recentSearches.length > MAX_DB_SEARCHES) {
                    recentSearches = recentSearches.slice(0, MAX_DB_SEARCHES);
                }

                // Update user document
                await userModel.findByIdAndUpdate(
                    userId,
                    { $set: { recentSearches } },
                    { new: true }
                );
            }

            return handleResponse(req, res, 201, "Search saved successfully", {
                query: searchQuery,
                saved: true
            });
        }
    );

    public static getRecentSearches = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { limit = 10 } = req.query;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            const maxLimit = Math.min(parseInt(limit as string) || 10, 20);
            const redisKey = `recent:searches:${userId}`;

            // Try to get from Redis first
            const recentSearches = await redis.lRange(redisKey, 0, maxLimit - 1);

            // If Redis has data, use it
            if (recentSearches && recentSearches.length > 0) {
                const formattedSearches = recentSearches
                    .map((search: string, index: number) => {
                        try {
                            const parsed = JSON.parse(search);
                            return {
                                id: index,
                                query: parsed.displayQuery || parsed.query,
                                itemId: parsed.itemId,
                                itemName: parsed.itemName,
                                itemImage: parsed.itemImage,
                                timestamp: parsed.timestamp,
                                timeAgo: getTimeAgo(parsed.timestamp)
                            };
                        } catch (e) {
                            return null;
                        }
                    })
                    .filter((search: any) => search !== null);

                return handleResponse(req, res, 200, "Recent searches fetched successfully", {
                    searches: formattedSearches,
                    count: formattedSearches.length,
                    source: "redis"
                });
            }

            // If Redis is empty, fallback to database
            const user = await userModel.findById(userId)
                .select('recentSearches')
                .lean();

            if (!user || !user.recentSearches || user.recentSearches.length === 0) {
                return handleResponse(req, res, 200, "No recent searches found", {
                    searches: [],
                    count: 0,
                    source: "database"
                });
            }

            // Format database searches
            const formattedSearches = user.recentSearches
                .slice(0, maxLimit)
                .map((search: any, index: number) => ({
                    id: index,
                    query: search.displayQuery || search.query,
                    itemId: search.itemId,
                    itemName: search.itemName,
                    itemImage: search.itemImage,
                    timestamp: search.timestamp,
                    timeAgo: getTimeAgo(search.timestamp)
                }));

            // Repopulate Redis cache from database
            for (const search of user.recentSearches) {
                const searchEntry = JSON.stringify({
                    query: search.query,
                    timestamp: search.timestamp
                });
                await redis.rPush(redisKey, searchEntry);
            }
            await redis.expire(redisKey, 30 * 24 * 60 * 60);

            return handleResponse(req, res, 200, "Recent searches fetched successfully", {
                searches: formattedSearches,
                count: formattedSearches.length,
                source: "database"
            });
        }
    );

    public static deleteRecentSearch = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;
            const { query } = req.params;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            if (!query) {
                return next(new ApiError(400, "Search query is required"));
            }

            const searchQuery = decodeURIComponent(query).toLowerCase();
            const redisKey = `recent:searches:${userId}`;

            const existingSearches = await redis.lRange(redisKey, 0, -1);
            let deleted = false;

            for (const search of existingSearches) {
                try {
                    const parsed = JSON.parse(search);
                    if (parsed.query === searchQuery) {
                        await redis.lRem(redisKey, 1, search);
                        deleted = true;
                        break;
                    }
                } catch (e) {
                    // Skip invalid entries
                }
            }

            return handleResponse(req, res, 200,
                deleted ? "Search deleted successfully" : "Search not found",
                { deleted, query: searchQuery }
            );
        }
    );

    public static clearRecentSearches = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const userId = (req as any).user?._id;

            if (!userId) {
                return next(new ApiError(401, "User not authenticated"));
            }

            const redisKey = `recent:searches:${userId}`;

            await redis.del(redisKey);

            return handleResponse(req, res, 200, "All recent searches cleared", {
                cleared: true
            });
        }
    );
}
