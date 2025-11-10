import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { redis } from "../config/redis";
import ItemModel from "../Databases/Models/item.Model"
import { Iuser } from "../Databases/Entities/user.Interface";
import ChildUnitModel from "../Databases/Models/childUnit.model";
import ParentUnitModel from "../Databases/Models/parentUnit.model";
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import { v2 as cloudinary } from "cloudinary";



declare global {
    namespace Express {
        interface Request {
            user?: Iuser; // or any, if you don’t have an interface
        }
    }
}

export default class ItemServices {
    public static createItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const { itemName, itemPrice, itemDescription, itemCategory, itemMfgDate, itemExpiryDate, itemParentUnit, itemChildUnit } = req.body;

            const fields = { itemName, itemPrice, itemCategory, itemMfgDate, itemExpiryDate, itemChildUnit };
            const missing = (Object.keys(fields) as Array<keyof typeof fields>)
                .filter(key => !fields[key]);

            if (missing.length > 0) {
                const message =
                    missing.length === 1
                        ? `${missing[0]} is required`
                        : `${missing.join(", ")} are required`;
                return next(new ApiError(400, message));
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

            const newItemData: any = {
                itemName,
                itemPrice,
                itemDescription,
                itemImages: imageUrls,
                itemCategory,
                itemMfgDate,
                itemParentUnit: finalParentUnit,
                itemChildUnit,
                itemExpiryDate,
                createdBy: req.user?._id,
                createAt: Date.now()
            }

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

            const updatedItem: any = await ItemModel.findByIdAndUpdate(
                itemId,
                {
                    ...updateData,
                    itemImages: imageUrls,
                    updatedBy: req.user?._id,
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
                    // Extract public IDs from Cloudinary URLs
                    const publicIds = existingItem.itemImages.map((url: string) => {
                        const parts = url.split("/");
                        const fileName = parts[parts.length - 1];
                        const publicId = fileName ? fileName.split(".")[0] : "";
                        return `Epharma/items/${publicId}`;
                    });

                    // Delete all images in parallel
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
            // if (cachedDeals) {
            //     //Check if newer deals exist in DB
            //     const latestDeal = await ItemModel.findOne({ itemDiscount: { $gte: Min_Discount } })
            //         .sort({ updatedAt: -1 })
            //         .select("updatedAt")
            //         .lean();

            //     console.log("Latest deal in DB updated at:", latestDeal?.updatedAt);
            //     const cacheMeta = JSON.parse(cachedDeals)?.[0]?.updatedAt;

            //     console.log("Cached deals updated at:", cacheMeta); 

            //     if (latestDeal && cacheMeta && new Date(latestDeal.updatedAt ?? 0) > new Date(cacheMeta)) {
            //         console.log("⚡ Newer deals found — refreshing cache...");
            //         await redis.del(cacheKey); // Clear old cache
            //     } else {
            //         console.log("Serving deals from cache");
            //         return handleResponse(req, res, 200, "Deals retrieved successfully (cached)", JSON.parse(cachedDeals));
            //     }
            // }

            if (cachedDeals) {
                return handleResponse(req, res, 200, "Deals retrieved successfully", JSON.parse(cachedDeals));
            }

            const deals = await ItemModel
                .find({ itemDiscount: { $gte: 40 } })
                .sort({ itemDiscount: -1, updatedAt: -1 })
                .limit(Max_Deals)
                .select("_id itemName itemPrice itemDiscount itemImages itemCategory itemBrand updatedAt")
                .lean();

            console.log(`Found ${deals.length} deals of the day`);
            console.log("Deals:", deals);

            if (deals.length === 0) {
                return next(new ApiError(404, "No deals found today"));
            }

            const formattedDeals = deals.map((deal) => ({
                ...deal,
                originalPrice: deal.itemPrice,
                discountedPrice: +(deal.itemPrice * (1 - (Number(deal.itemDiscount ?? 0) / 100))).toFixed(2),
            }));

            console.log("Formatted Deals:", formattedDeals);

            await redis.set(cacheKey, JSON.stringify(formattedDeals), { EX: 21600 });

            return handleResponse(req, res, 200, "Deals fetched successfully", formattedDeals);
        }
    )
}

