import Advertisement from '../Databases/Models/advertisement.model';
import { Request, Response, NextFunction } from 'express';
import type { SortOrder } from 'mongoose';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { getCache, setCache, deleteCache, deleteCachePattern } from '../Utils/cache';
import { ApiError } from '../Utils/ApiError';
import { handleResponse } from '../Utils/handleResponse';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import { IAdvertisement } from '../Databases/Entities/advertisement.interface';
import User from '../Databases/Models/user.Models';

export default class AdvertisementService {
    private static CACHE_PREFIX = "advertisements";

    public static getDebugInfo = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const currentDate = new Date();
            const totalAds = await Advertisement.countDocuments({});
            const activeAds = await Advertisement.countDocuments({
                isActive: true
            });
            const allAds = await Advertisement.find({})
                .select('title type isActive startDate endDate createdAt')
                .lean();
            
            return handleResponse(req, res, 200, "Advertisement debug info", {
                totalAds,
                activeAds,
                allAds: allAds.map(ad => ({
                    ...ad,
                    isCurrentlyActive: ad.isActive && 
                        new Date(ad.startDate) <= currentDate && 
                        new Date(ad.endDate) >= currentDate,
                    startDateCheck: new Date(ad.startDate) <= currentDate,
                    endDateCheck: new Date(ad.endDate) >= currentDate
                })),
                currentDate,
                modelName: Advertisement.modelName,
                collectionName: Advertisement.collection.name
            });
        }
    );

    public static createAd = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const {
                title,
                description,
                type,
                brand,
                itemId,
                categoryId,
                offerText,
                startDate,
                endDate,
                isActive = true
            } = req.body;

            // Validation
            if (
                !title?.trim()
                || !description?.trim()
                || !type 
                || !startDate 
                || !endDate) {
                return next(new ApiError(
                    400, "Title, description, type, startDate, and endDate are required"
                ));
            }

            if (!["Product", "Brand", "Offer", "Event"].includes(type)) {
                return next(new ApiError(400, "Type must be Product, Brand, Offer, or Event"));
            }

            if (title.trim().length < 3 || title.trim().length > 100) {
                return next(new ApiError(400, "Title must be between 3 and 100 characters"));
            }

            if (description.trim().length < 2 || description.trim().length > 100) {
                return next(new ApiError(400, "Description must be between 2 and 100 characters"));
            }

            const start = new Date(startDate);
            const end = new Date(endDate);
            
            if (start >= end) {
                return next(new ApiError(400, "End date must be after start date"));
            }

            if (start < new Date()) {
                return next(new ApiError(400, "Start date cannot be in the past"));
            }

            const imageFile = req.file;
            if (!imageFile) {
                return next(new ApiError(400, "Advertisement image is required"));
            }

            let imageUrl: string;
            
            try {
                const uploadResult = await uploadToCloudinary(imageFile.buffer, "advertisements/images");
                imageUrl = uploadResult.secure_url;
            } catch (error: any) {
                return next(new ApiError(500, `Image upload failed: ${error.message}`));
            }

            if (itemId && !mongoose.isValidObjectId(itemId)) {
                return next(new ApiError(400, "Invalid item ID"));
            }

            if (categoryId && !mongoose.isValidObjectId(categoryId)) {
                return next(new ApiError(400, "Invalid category ID"));
            }

            const adData = {
                title: title.trim(),
                description: description.trim(),
                type,
                brand: brand?.trim(),
                imageUrl,
                itemId: itemId ? new mongoose.Types.ObjectId(itemId) : undefined,
                categoryId: categoryId ? new mongoose.Types.ObjectId(categoryId) : undefined,
                offerText: offerText?.trim(),
                startDate: start,
                endDate: end,
                isActive,
                adClickTracking: [],
                createdBy: (req as any).user?.id || null,
                updatedBy: (req as any).user?.id || null
            };

            const advertisement = await Advertisement.create(adData);

            process.nextTick(async () => {
                try {
                    await Promise.all([
                        deleteCachePattern(`${this.CACHE_PREFIX}:*`),
                        deleteCache("currentlyRunningAds")
                    ]);
                } catch (error) {
                    console.error('Cache clearing failed:', error);
                }
            });

            return handleResponse(
                req,
                res,
                201,
                "Advertisement created successfully",
                {
                    advertisement: {
                        _id: advertisement._id,
                        title: advertisement.title,
                        description: advertisement.description,
                        type: advertisement.type,
                        imageUrl: advertisement.imageUrl,
                        startDate: advertisement.startDate,
                        endDate: advertisement.endDate,
                        isActive: advertisement.isActive,
                        createdAt: advertisement.createdAt
                    },
                    meta: {
                        imageUploadStatus: "completed",
                        note: "Advertisement created with image successfully"
                    }
                }
            );
        }
    );

    public static updateAd = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { adId } = req.params;
            const {
                title,
                description,
                type,
                brand,
                itemId,
                categoryId,
                offerText,
                startDate,
                endDate,
                isActive
            } = req.body;

            // Validate advertisement ID
            if (!adId || !mongoose.isValidObjectId(adId)) {
                return next(new ApiError(400, "Invalid advertisement ID"));
            }

            // Find existing advertisement
            const existingAd = await Advertisement.findById(adId);
            if (!existingAd) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            // Build update data object
            const updateData: any = {
                updatedBy: (req as any).user?.id || null,
                updatedAt: new Date()
            };

            // Validate and update fields only if provided
            if (title !== undefined) {
                if (!title?.trim()) {
                    return next(new ApiError(400, "Title cannot be empty"));
                }
                if (title.trim().length < 3 || title.trim().length > 100) {
                    return next(new ApiError(400, "Title must be between 3 and 100 characters"));
                }
                updateData.title = title.trim();
            }

            if (description !== undefined) {
                if (!description?.trim()) {
                    return next(new ApiError(400, "Description cannot be empty"));
                }
                if (description.trim().length < 2 || description.trim().length > 100) {
                    return next(new ApiError(400, "Description must be between 2 and 100 characters"));
                }
                updateData.description = description.trim();
            }

            if (type !== undefined) {
                if (!["Product", "Brand", "Offer", "Event"].includes(type)) {
                    return next(new ApiError(400, "Type must be Product, Brand, Offer, or Event"));
                }
                updateData.type = type;
            }

            if (brand !== undefined) {
                updateData.brand = brand?.trim();
            }

            if (offerText !== undefined) {
                updateData.offerText = offerText?.trim();
            }

            if (itemId !== undefined) {
                if (itemId && !mongoose.isValidObjectId(itemId)) {
                    return next(new ApiError(400, "Invalid item ID"));
                }
                updateData.itemId = itemId ? new mongoose.Types.ObjectId(itemId) : null;
            }

            if (categoryId !== undefined) {
                if (categoryId && !mongoose.isValidObjectId(categoryId)) {
                    return next(new ApiError(400, "Invalid category ID"));
                }
                updateData.categoryId = categoryId ? new mongoose.Types.ObjectId(categoryId) : null;
            }

            if (startDate !== undefined || endDate !== undefined) {
                const start = startDate ? new Date(startDate) : existingAd.startDate;
                const end = endDate ? new Date(endDate) : existingAd.endDate;
                
                if (start >= end) {
                    return next(new ApiError(400, "End date must be after start date"));
                }

                // Allow updating past dates for existing ads
                if (startDate !== undefined) {
                    updateData.startDate = start;
                }
                if (endDate !== undefined) {
                    updateData.endDate = end;
                }
            }

            if (isActive !== undefined) {
                updateData.isActive = Boolean(isActive);
            }

            // Handle image update if provided
            const imageFile = req.file;
            if (imageFile) {
                try {
                    const uploadResult = await uploadToCloudinary(imageFile.buffer, "advertisements/images");
                    updateData.imageUrl = uploadResult.secure_url;
                } catch (error: any) {
                    return next(new ApiError(500, `Image upload failed: ${error.message}`));
                }
            }

            // Update the advertisement
            const updatedAd = await Advertisement.findByIdAndUpdate(
                adId,
                updateData,
                { 
                    new: true, 
                    runValidators: true 
                }
            );

            if (!updatedAd) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            // Clear cache in background
            process.nextTick(async () => {
                try {
                    await Promise.all([
                        deleteCachePattern(`${this.CACHE_PREFIX}:*`),
                        deleteCache("currentlyRunningAds")
                    ]);
                } catch (error) {
                    console.error('Cache clearing failed:', error);
                }
            });

            return handleResponse(
                req,
                res,
                200,
                "Advertisement updated successfully",
                {
                    advertisement: {
                        _id: updatedAd._id,
                        title: updatedAd.title,
                        description: updatedAd.description,
                        type: updatedAd.type,
                        brand: updatedAd.brand,
                        imageUrl: updatedAd.imageUrl,
                        offerText: updatedAd.offerText,
                        startDate: updatedAd.startDate,
                        endDate: updatedAd.endDate,
                        isActive: updatedAd.isActive,
                        itemId: updatedAd.itemId,
                        categoryId: updatedAd.categoryId,
                        updatedAt: updatedAd.updatedAt,
                        updatedBy: updatedAd.updatedBy
                    },
                    meta: {
                        fieldsUpdated: Object.keys(updateData).filter(key => key !== 'updatedBy' && key !== 'updatedAt'),
                        imageUpdated: !!imageFile,
                        note: imageFile ? "Advertisement updated with new image" : "Advertisement updated successfully"
                    }
                }
            );
        }
    );

    public static getCurrentlyRunningAds = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const CACHE_KEY = "currentlyRunningAds";
            const CACHE_TTL = 1800; // 30 minutes

            try {
                // First try to get from Redis cache
                const cachedData = await getCache<{ data: any[]; checksum: string }>(CACHE_KEY);
                if (cachedData) {
                    return handleResponse(
                        req,
                        res,
                        200,
                        "Currently running advertisements fetched from Redis Cache",
                        cachedData
                    );
                }

                // If not in cache, get from MongoDB
                const currentDate = new Date();

                const advertisements = await Advertisement.aggregate([
                    {
                        $match: {
                            isActive: true,
                            startDate: { $lte: currentDate },
                            endDate: { $gte: currentDate }
                        }
                    },
                    {
                        $lookup: {
                            from: "categories",
                            localField: "categoryId",
                            foreignField: "_id",
                            as: "categoryDetails"
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "createdBy",
                            foreignField: "_id",
                            as: "creatorDetails",
                            pipeline: [{ $project: { name: 1, email: 1 } }]
                        }
                    },
                    {
                        $addFields: {
                            categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] },
                            creatorInfo: { $arrayElemAt: ["$creatorDetails", 0] },
                            clickCount: { $size: { $ifNull: ["$adClickTracking", []] } },
                            daysRemaining: {
                                $round: [
                                    {
                                        $divide: [
                                            { $subtract: ["$endDate", currentDate] },
                                            1000 * 60 * 60 * 24
                                        ]
                                    },
                                    1
                                ]
                            },
                            hoursRemaining: {
                                $round: [
                                    {
                                        $divide: [
                                            { $subtract: ["$endDate", currentDate] },
                                            1000 * 60 * 60
                                        ]
                                    },
                                    1
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            title: 1,
                            description: 1,
                            type: 1,
                            brand: 1,
                            imageUrl: 1,
                            offerText: 1,
                            startDate: 1,
                            endDate: 1,
                            isActive: 1,
                            clickCount: 1,
                            daysRemaining: 1,
                            hoursRemaining: 1,
                            category: {
                                $cond: {
                                    if: { $ne: ["$categoryInfo", null] },
                                    then: {
                                        _id: "$categoryInfo._id",
                                        name: "$categoryInfo.name",
                                        code: "$categoryInfo.code"
                                    },
                                    else: null
                                }
                            },
                            creator: {
                                $cond: {
                                    if: { $ne: ["$creatorInfo", null] },
                                    then: {
                                        _id: "$creatorInfo._id",
                                        name: "$creatorInfo.name",
                                        email: "$creatorInfo.email"
                                    },
                                    else: null
                                }
                            },
                            itemId: 1,
                            isCurrentlyRunning: true,
                            status: "active",
                            createdAt: 1,
                            updatedAt: 1
                        }
                    },
                    { $sort: { createdAt: -1 } }
                ]);

                // Create checksum for cache validation
                const checksum = crypto
                    .createHash("sha256")
                    .update(JSON.stringify(advertisements))
                    .digest("hex");

                const responseData = {
                    data: advertisements,
                    checksum,
                    meta: {
                        totalAds: advertisements.length,
                        currentDate,
                        cacheStatus: "fresh_from_db",
                        lastUpdated: new Date()
                    }
                };

                // Store in Redis cache
                await setCache(CACHE_KEY, responseData, CACHE_TTL);

                return handleResponse(
                    req,
                    res,
                    200,
                    "Currently running advertisements fetched from MongoDB",
                    responseData
                );

            } catch (error: any) {
                console.error("Redis/Mongo Fetch Error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );

    public static getActiveAds = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const {
                page = 1,
                limit = 10,
                type,
                categoryId,
                search = "",
                sortBy = "createdAt",
                order = "desc"
            } = req.query;

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(50, parseInt(limit as string) || 10);
            const skip = (pageNum - 1) * limitNum;

            // Simple filter for active ads
            const matchStage: any = {
                isActive: true
            };

            // Add optional filters
            if (type && ["Product", "Brand", "Offer", "Event"].includes(type as string)) {
                matchStage.type = type;
            }

            if (categoryId && mongoose.isValidObjectId(categoryId as string)) {
                matchStage.categoryId = new mongoose.Types.ObjectId(categoryId as string);
            }

            if (search && search.toString().trim()) {
                const searchRegex = new RegExp(search.toString().trim(), "i");
                matchStage.$or = [
                    { title: { $regex: searchRegex } },
                    { description: { $regex: searchRegex } },
                    { brand: { $regex: searchRegex } },
                    { offerText: { $regex: searchRegex } }
                ];
            }

            // Get total count
            const totalAds = await Advertisement.countDocuments(matchStage);

            // Get advertisements
            const ads = await Advertisement.find(matchStage)
                .sort({ [sortBy as string]: order === 'asc' ? 1 : -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();

            const currentDate = new Date();

            // Transform ads data
            const transformedAds = ads.map(ad => ({
                _id: ad._id,
                title: ad.title,
                description: ad.description,
                type: ad.type,
                brand: ad.brand,
                imageUrl: ad.imageUrl,
                offerText: ad.offerText,
                startDate: ad.startDate,
                endDate: ad.endDate,
                isActive: ad.isActive,
                clickCount: ad.adClickTracking?.length || 0,
                isCurrentlyActive: ad.isActive && 
                    new Date(ad.startDate) <= currentDate && 
                    new Date(ad.endDate) >= currentDate,
                daysRemaining: Math.round((new Date(ad.endDate).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24) * 10) / 10,
                createdAt: ad.createdAt,
                updatedAt: ad.updatedAt
            }));

            const responseData = {
                ads: transformedAds,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalAds / limitNum),
                    totalItems: totalAds,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < Math.ceil(totalAds / limitNum),
                    hasPrevPage: pageNum > 1
                },
                filters: { type, categoryId, search },
                meta: {
                    sortBy,
                    order,
                    currentDate,
                    totalActiveAds: totalAds
                }
            };

            return handleResponse(req, res, 200, "Active advertisements fetched successfully", responseData);
        }
    );

    public static trackClick = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { adId } = req.params;
            const userId = (req as any).user?.id;
            if (!adId || !mongoose.isValidObjectId(adId)) {
                return next(new ApiError(400, "Invalid advertisement ID"));
            }

            if (!userId || !(await User.findById(userId))) {
                return next(new ApiError(401, "User authentication required"));
            }
         
            const advertisement = await Advertisement.findById(adId);
            
            if (!advertisement) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            if (!advertisement.isActive) {
                return next(new ApiError(400, "Advertisement is not active"));
            }

            const currentDate = new Date();
            if (currentDate < advertisement.startDate || currentDate > advertisement.endDate) {
                return next(new ApiError(400, "Advertisement is not currently running"));
            }

            // Check if user already clicked in last 24 hours (prevent spam)
            const twentyFourHoursAgo = new Date(currentDate.getTime() - (24 * 60 * 60 * 1000));

            const recentClick = advertisement.adClickTracking.find(click => 
                click.userId.toString() === userId.toString() &&
                click.timestamp >= twentyFourHoursAgo
            );

            if (recentClick) {
                const nextAllowedClick = new Date(recentClick.timestamp.getTime() + (24 * 60 * 60 * 1000));
                const hoursLeft = Math.ceil((nextAllowedClick.getTime() - currentDate.getTime()) / (60 * 60 * 1000));
                
                return handleResponse(
                    req,
                    res,
                    200,
                    `Click already tracked. Next click allowed in ${hoursLeft} hours`,
                    {
                        adId,
                        userId,
                        lastClickTime: recentClick.timestamp,
                        nextAllowedClick,
                        totalClicks: advertisement.adClickTracking.length,
                        cooldownHours: hoursLeft
                    }
                );
            }

            // Add new click tracking
            advertisement.adClickTracking.push({
                userId: new mongoose.Types.ObjectId(userId),
                timestamp: currentDate
            } as any);

            await advertisement.save();

            return handleResponse(
                req,
                res,
                200,
                "Click tracked successfully",
                {
                    adId,
                    userId,
                    clickTime: currentDate,
                    totalClicks: advertisement.adClickTracking.length,
                    adTitle: advertisement.title
                }
            );
        }
    );

    public static getAnalytics = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const {
                period = "7d",
                adId,
                type,
                startDate,
                endDate
            } = req.query;

            let dateFilter: any = {};
            const currentDate = new Date();

            // Set date range based on period
            if (startDate && endDate) {
                dateFilter = {
                    $gte: new Date(startDate as string),
                    $lte: new Date(endDate as string)
                };
            } else {
                let daysBack: number;
                switch (period) {
                    case "24h":
                        daysBack = 1;
                        break;
                    case "7d":
                        daysBack = 7;
                        break;
                    case "30d":
                        daysBack = 30;
                        break;
                    default:
                        daysBack = 7;
                }
                
                const startPeriod = new Date(currentDate.getTime() - (daysBack * 24 * 60 * 60 * 1000));
                dateFilter = { $gte: startPeriod, $lte: currentDate };
            }

            const matchStage: any = {
                createdAt: dateFilter
            };

            if (adId && mongoose.isValidObjectId(adId as string)) {
                matchStage._id = new mongoose.Types.ObjectId(adId as string);
            }

            if (type && ["Product", "Brand", "Offer", "Event"].includes(type as string)) {
                matchStage.type = type;
            }

            const totalAds = await Advertisement.countDocuments(matchStage);
            const activeAds = await Advertisement.countDocuments({
                ...matchStage,
                isActive: true
            });

            const ads = await Advertisement.find(matchStage).lean();
            const totalClicks = ads.reduce((sum, ad) => sum + (ad.adClickTracking?.length || 0), 0);
            const avgClicksPerAd = totalAds > 0 ? Math.round((totalClicks / totalAds) * 100) / 100 : 0;

            const responseData = {
                period: period,
                dateRange: dateFilter,
                general: {
                    totalAds,
                    activeAds,
                    totalClicks,
                    avgClicksPerAd,
                    topPerformingAds: ads
                        .map(ad => ({
                            _id: ad._id,
                            title: ad.title,
                            type: ad.type,
                            clickCount: ad.adClickTracking?.length || 0,
                            isActive: ad.isActive
                        }))
                        .sort((a, b) => b.clickCount - a.clickCount)
                        .slice(0, 10)
                },
                byType: ["Product", "Brand", "Offer", "Event"].map(t => {
                    const typeAds = ads.filter(ad => ad.type === t);
                    return {
                        type: t,
                        count: typeAds.length,
                        totalClicks: typeAds.reduce((sum, ad) => sum + (ad.adClickTracking?.length || 0), 0),
                        avgClicks: typeAds.length > 0 ? Math.round((typeAds.reduce((sum, ad) => sum + (ad.adClickTracking?.length || 0), 0) / typeAds.length) * 100) / 100 : 0
                    };
                }),
                generatedAt: currentDate,
                filters: { adId, type }
            };

            return handleResponse(req, res, 200, "Advertisement analytics fetched successfully", responseData);
        }
    );

    public static deleteAd = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { adId } = req.params;

            if (!adId || !mongoose.isValidObjectId(adId)) {
                return next(new ApiError(400, "Invalid advertisement ID"));
            }

            const existingAd = await Advertisement.findById(adId);
            if (!existingAd) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            const adDetails = {
                _id: existingAd._id,
                title: existingAd.title,
                description: existingAd.description,
                type: existingAd.type,
                brand: existingAd.brand,
                imageUrl: existingAd.imageUrl,
                isActive: existingAd.isActive,
                startDate: existingAd.startDate,
                endDate: existingAd.endDate,
                createdAt: existingAd.createdAt,
                deletedAt: new Date(),
                deletedBy: (req as any).user?.id || null
            };

            const deletedAd = await Advertisement.findByIdAndDelete(adId);
            
            if (!deletedAd) {
                return next(new ApiError(404, "Advertisement not found or already deleted"));
            }

            // Clear cache in background
            process.nextTick(async () => {
                try {
                    await Promise.all([
                        deleteCachePattern(`${this.CACHE_PREFIX}:*`),
                        deleteCache("currentlyRunningAds")
                    ]);
                } catch (error) {
                    console.error('Cache clearing failed:', error);
                }
            });

            return handleResponse(
                req,
                res,
                200,
                "Advertisement deleted successfully",
                {
                    deletedAdvertisement: adDetails,
                    meta: {
                        operation: "permanent_delete",
                        totalClicksLost: existingAd.adClickTracking?.length || 0,
                        wasActive: existingAd.isActive,
                        note: "Advertisement permanently deleted from database"
                    }
                }
            );
        }
    );

    public static softDeleteAd = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { adId } = req.params;

            if (!adId || !mongoose.isValidObjectId(adId)) {
                return next(new ApiError(400, "Invalid advertisement ID"));
            }

            const existingAd = await Advertisement.findById(adId);
            if (!existingAd) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            if (!existingAd.isActive) {
                return handleResponse(
                    req,
                    res,
                    200,
                    "Advertisement already deactivated",
                    {
                        advertisement: {
                            _id: existingAd._id,
                            title: existingAd.title,
                            isActive: existingAd.isActive,
                            updatedAt: existingAd.updatedAt
                        },
                        meta: {
                            operation: "soft_delete",
                            alreadyInactive: true,
                            note: "Advertisement was already deactivated"
                        }
                    }
                );
            }

            const updatedAd = await Advertisement.findByIdAndUpdate(
                adId,
                {
                    isActive: false,
                    updatedBy: (req as any).user?.id || null,
                    updatedAt: new Date()
                },
                { new: true, runValidators: true }
            );

            if (!updatedAd) {
                return next(new ApiError(404, "Advertisement not found"));
            }

            // Clear cache in background
            process.nextTick(async () => {
                try {
                    await Promise.all([
                        deleteCachePattern(`${this.CACHE_PREFIX}:*`),
                        deleteCache("currentlyRunningAds")
                    ]);
                } catch (error) {
                    console.error('Cache clearing failed:', error);
                }
            });

            return handleResponse(
                req,
                res,
                200,
                "Advertisement deactivated successfully",
                {
                    advertisement: {
                        _id: updatedAd._id,
                        title: updatedAd.title,
                        description: updatedAd.description,
                        type: updatedAd.type,
                        isActive: updatedAd.isActive,
                        startDate: updatedAd.startDate,
                        endDate: updatedAd.endDate,
                        updatedAt: updatedAd.updatedAt,
                        updatedBy: updatedAd.updatedBy
                    },
                    meta: {
                        operation: "soft_delete",
                        clicksPreserved: updatedAd.adClickTracking?.length || 0,
                        canReactivate: true,
                        note: "Advertisement deactivated but data preserved"
                    }
                }
            );
        }
    );
}

export class AdvertisementLogService {
    private static CACHE_PREFIX = "advertisementLogs";
    private static CACHE_TTL = 1800; // 30 minutes

    public static getAllLogs = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const {
                page = 1,
                limit = 20,
                search = "",
                action,
                userId,
                advertisementId,
                startDate,
                endDate,
                sortBy = "timestamp",
                order = "desc"
            } = req.query;

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(100, parseInt(limit as string) || 20);
            const skip = (pageNum - 1) * limitNum;

            const cacheKey = `${this.CACHE_PREFIX}:all:${crypto
                .createHash("md5")
                .update(JSON.stringify({ page, limit, search, action, userId, advertisementId, startDate, endDate, sortBy, order }))
                .digest("hex")}`;

            try {
                const cachedData = await getCache(cacheKey);
                if (cachedData) {
                    return handleResponse(req, res, 200, "Advertisement logs fetched from cache", cachedData);
                }

                const matchStage: any = {};

                if (search && search.toString().trim()) {
                    const searchRegex = new RegExp(search.toString().trim(), "i");
                    matchStage.$or = [
                        { "advertisementDetails.title": { $regex: searchRegex } },
                        { "advertisementDetails.description": { $regex: searchRegex } },
                        { "advertisementDetails.brand": { $regex: searchRegex } },
                        { "userDetails.name": { $regex: searchRegex } },
                        { "userDetails.email": { $regex: searchRegex } },
                        { action: { $regex: searchRegex } }
                    ];
                }

                if (action && ["CREATE", "UPDATE", "DELETE"].includes(action as string)) {
                    matchStage.action = action;
                }

                if (userId && mongoose.isValidObjectId(userId)) {
                    matchStage.performedBy = new mongoose.Types.ObjectId(userId as string);
                }

                if (advertisementId && mongoose.isValidObjectId(advertisementId)) {
                    matchStage.advertisementId = new mongoose.Types.ObjectId(advertisementId as string);
                }

                if (startDate || endDate) {
                    matchStage.timestamp = {};
                    if (startDate) matchStage.timestamp.$gte = new Date(startDate as string);
                    if (endDate) matchStage.timestamp.$lte = new Date(endDate as string);
                }

                const sortOrder = order === "asc" ? 1 : -1;
                const sortObj = { [sortBy as string]: sortOrder } as any;

                const { default: AdvertisementLog } = await import('../Databases/Models/advertisementLog.model');

                const pipeline: any[] = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: "advertisements",
                            localField: "advertisementId",
                            foreignField: "_id",
                            as: "advertisementDetails",
                            pipeline: [{ $project: { title: 1, description: 1, brand: 1, type: 1, imageUrl: 1 } }]
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "performedBy",
                            foreignField: "_id",
                            as: "userDetails",
                            pipeline: [{ $project: { name: 1, email: 1 } }]
                        }
                    },
                    {
                        $addFields: {
                            advertisementInfo: { $arrayElemAt: ["$advertisementDetails", 0] },
                            userInfo: { $arrayElemAt: ["$userDetails", 0] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            action: 1,
                            timestamp: 1,
                            oldData: 1,
                            newData: 1,
                            advertisementInfo: {
                                $cond: {
                                    if: { $ne: ["$advertisementInfo", null] },
                                    then: "$advertisementInfo",
                                    else: { title: "Deleted Advertisement", description: "", brand: "", type: "", imageUrl: "" }
                                }
                            },
                            userInfo: {
                                $cond: {
                                    if: { $ne: ["$userInfo", null] },
                                    then: "$userInfo",
                                    else: { name: "Unknown User", email: "" }
                                }
                            },
                            summary: {
                                $concat: [
                                    "$action",
                                    " - ",
                                    {
                                        $cond: {
                                            if: { $ne: ["$advertisementInfo.title", null] },
                                            then: "$advertisementInfo.title",
                                            else: "Advertisement"
                                        }
                                    }
                                ]
                            },
                            createdAt: 1,
                            updatedAt: 1
                        }
                    },
                    { $sort: sortObj },
                    {
                        $facet: {
                            logs: [{ $skip: skip }, { $limit: limitNum }],
                            totalCount: [{ $count: "count" }]
                        }
                    }
                ];

                const [result] = await AdvertisementLog.aggregate(pipeline);
                
                const totalLogs = result?.totalCount[0]?.count || 0;
                const logs = result?.logs || [];

                const responseData = {
                    logs,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalLogs / limitNum),
                        totalItems: totalLogs,
                        itemsPerPage: limitNum,
                        hasNextPage: pageNum < Math.ceil(totalLogs / limitNum),
                        hasPrevPage: pageNum > 1
                    },
                    filters: { search, action, userId, advertisementId, startDate, endDate },
                    meta: { 
                        sortBy, 
                        order, 
                        aggregationUsed: true,
                        cacheStatus: "fresh_from_db" 
                    }
                };

                await setCache(cacheKey, responseData, this.CACHE_TTL);

                return handleResponse(req, res, 200, "Advertisement logs fetched successfully", responseData);

            } catch (error: any) {
                console.error("Advertisement logs fetch error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );

    public static getLogById = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { id } = req.params;

            if (!id || !mongoose.isValidObjectId(id)) {
                return next(new ApiError(400, "Invalid log ID"));
            }

            const cacheKey = `${this.CACHE_PREFIX}:single:${id}`;

            try {
                const cachedData = await getCache(cacheKey);
                if (cachedData) {
                    return handleResponse(req, res, 200, "Advertisement log fetched from cache", cachedData);
                }

                const { default: AdvertisementLog } = await import('../Databases/Models/advertisementLog.model');

                const pipeline: any[] = [
                    { $match: { _id: new mongoose.Types.ObjectId(id) } },
                    {
                        $lookup: {
                            from: "advertisements",
                            localField: "advertisementId",
                            foreignField: "_id",
                            as: "advertisementDetails"
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "performedBy",
                            foreignField: "_id",
                            as: "userDetails"
                        }
                    },
                    {
                        $addFields: {
                            advertisementInfo: { $arrayElemAt: ["$advertisementDetails", 0] },
                            userInfo: { $arrayElemAt: ["$userDetails", 0] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            action: 1,
                            timestamp: 1,
                            oldData: 1,
                            newData: 1,
                            advertisementInfo: {
                                $cond: {
                                    if: { $ne: ["$advertisementInfo", null] },
                                    then: "$advertisementInfo",
                                    else: null
                                }
                            },
                            userInfo: {
                                $cond: {
                                    if: { $ne: ["$userInfo", null] },
                                    then: "$userInfo",
                                    else: null
                                }
                            },
                            createdAt: 1,
                            updatedAt: 1
                        }
                    }
                ];

                const [log] = await AdvertisementLog.aggregate(pipeline);

                if (!log) {
                    return next(new ApiError(404, "Advertisement log not found"));
                }

                await setCache(cacheKey, log, this.CACHE_TTL);

                return handleResponse(req, res, 200, "Advertisement log fetched successfully", log);

            } catch (error: any) {
                console.error("Advertisement log fetch error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );

    public static getLogsByDateRange = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { startDate, endDate, action, limit = 50 } = req.query;

            if (!startDate || !endDate) {
                return next(new ApiError(400, "Start date and end date are required"));
            }

            try {
                const matchStage: any = {
                    timestamp: {
                        $gte: new Date(startDate as string),
                        $lte: new Date(endDate as string)
                    }
                };

                if (action && ["CREATE", "UPDATE", "DELETE"].includes(action as string)) {
                    matchStage.action = action;
                }

                const limitNum = Math.min(200, parseInt(limit as string) || 50);

                const { default: AdvertisementLog } = await import('../Databases/Models/advertisementLog.model');

                const pipeline: any[] = [
                    { $match: matchStage },
                    {
                        $group: {
                            _id: {
                                date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                                action: "$action"
                            },
                            count: { $sum: 1 },
                            logs: { 
                                $push: { 
                                    _id: "$_id", 
                                    advertisementId: "$advertisementId",
                                    performedBy: "$performedBy",
                                    timestamp: "$timestamp" 
                                } 
                            }
                        }
                    },
                    {
                        $group: {
                            _id: "$_id.date",
                            actions: {
                                $push: {
                                    action: "$_id.action",
                                    count: "$count",
                                    logs: { $slice: ["$logs", 5] }
                                }
                            },
                            totalCount: { $sum: "$count" }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            date: "$_id",
                            actions: 1,
                            totalCount: 1
                        }
                    },
                    { $sort: { "date": -1 } },
                    { $limit: limitNum }
                ];

                const result = await AdvertisementLog.aggregate(pipeline);

                return handleResponse(req, res, 200, "Date range advertisement logs fetched successfully", {
                    dateRange: { startDate, endDate },
                    data: result,
                    totalDays: result.length,
                    filterApplied: { action }
                });

            } catch (error: any) {
                console.error("Advertisement logs date range error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );

    public static getLogStats = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { period = "7d" } = req.query;

            let startDate: Date;
            const endDate = new Date();

            switch (period) {
                case "24h":
                    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    break;
                case "7d":
                    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case "30d":
                    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            }

            const cacheKey = `${this.CACHE_PREFIX}:stats:${period}`;

            try {
                const cachedData = await getCache(cacheKey);
                if (cachedData) {
                    return handleResponse(req, res, 200, "Advertisement log stats fetched from cache", cachedData);
                }

                const { default: AdvertisementLog } = await import('../Databases/Models/advertisementLog.model');

                const pipeline: any[] = [
                    {
                        $match: {
                            timestamp: { $gte: startDate, $lte: endDate }
                        }
                    },
                    {
                        $group: {
                            _id: "$action",
                            count: { $sum: 1 },
                            latestLog: { $max: "$timestamp" },
                            advertisementIds: { $addToSet: "$advertisementId" }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            actions: {
                                $push: {
                                    action: "$_id",
                                    count: "$count",
                                    latestLog: "$latestLog",
                                    uniqueAdvertisements: { $size: "$advertisementIds" }
                                }
                            },
                            totalLogs: { $sum: "$count" }
                        }
                    }
                ];

                const [stats] = await AdvertisementLog.aggregate(pipeline);

                const responseData = {
                    period,
                    dateRange: { startDate, endDate },
                    totalLogs: stats?.totalLogs || 0,
                    actionBreakdown: stats?.actions || [],
                    generatedAt: new Date(),
                    cacheStatus: "fresh_from_db"
                };

                await setCache(cacheKey, responseData, 600); // 10 minutes cache for stats

                return handleResponse(req, res, 200, "Advertisement log statistics fetched successfully", responseData);

            } catch (error: any) {
                console.error("Advertisement log stats error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );

    public static getLogsByAdvertisement = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const { advertisementId } = req.params;
            const { page = 1, limit = 10 } = req.query;

            if (!advertisementId || !mongoose.isValidObjectId(advertisementId)) {
                return next(new ApiError(400, "Invalid advertisement ID"));
            }

            const pageNum = parseInt(page as string) || 1;
            const limitNum = Math.min(50, parseInt(limit as string) || 10);
            const skip = (pageNum - 1) * limitNum;

            try {
                const { default: AdvertisementLog } = await import('../Databases/Models/advertisementLog.model');

                const matchStage = {
                    advertisementId: new mongoose.Types.ObjectId(advertisementId)
                };

                const pipeline: any[] = [
                    { $match: matchStage },
                    {
                        $lookup: {
                            from: "advertisements",
                            localField: "advertisementId",
                            foreignField: "_id",
                            as: "advertisementDetails",
                            pipeline: [{ $project: { title: 1, description: 1, type: 1, brand: 1 } }]
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "performedBy",
                            foreignField: "_id",
                            as: "userDetails",
                            pipeline: [{ $project: { name: 1, email: 1 } }]
                        }
                    },
                    {
                        $addFields: {
                            advertisementInfo: { $arrayElemAt: ["$advertisementDetails", 0] },
                            userInfo: { $arrayElemAt: ["$userDetails", 0] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            action: 1,
                            timestamp: 1,
                            oldData: 1,
                            newData: 1,
                            advertisementInfo: 1,
                            userInfo: {
                                $cond: {
                                    if: { $ne: ["$userInfo", null] },
                                    then: "$userInfo",
                                    else: { name: "System", email: "" }
                                }
                            },
                            createdAt: 1,
                            updatedAt: 1
                        }
                    },
                    { $sort: { timestamp: -1 } },
                    {
                        $facet: {
                            logs: [{ $skip: skip }, { $limit: limitNum }],
                            totalCount: [{ $count: "count" }]
                        }
                    }
                ];

                const [result] = await AdvertisementLog.aggregate(pipeline);
                
                const totalLogs = result?.totalCount[0]?.count || 0;
                const logs = result?.logs || [];

                const responseData = {
                    advertisementId,
                    logs,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalLogs / limitNum),
                        totalItems: totalLogs,
                        itemsPerPage: limitNum,
                        hasNextPage: pageNum < Math.ceil(totalLogs / limitNum),
                        hasPrevPage: pageNum > 1
                    },
                    meta: {
                        advertisementInfo: logs[0]?.advertisementInfo || null,
                        totalActions: totalLogs
                    }
                };

                return handleResponse(req, res, 200, "Advertisement logs by ID fetched successfully", responseData);

            } catch (error: any) {
                console.error("Advertisement logs by ID error:", error);
                return next(new ApiError(500, "Internal Server Error"));
            }
        }
    );
}