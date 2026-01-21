/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Service - Business logic for category management.           │
│  Handles category creation, updates, retrieval, and caching.          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { CategoryModel } from "../Databases/Models/Category.model";
import CategoryLogModel from "../Databases/Models/categoryLog.model";
import { Request, Response, NextFunction } from "express";
import type { SortOrder } from "mongoose";
import {
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
} from "../Utils/cache";
import crypto from "crypto";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import mongoose from "mongoose";
import jwtTokens from "jsonwebtoken";
import {
  ICategory,
  CategoryServiceResponse,
  CATEGORY_CONSTANTS,
} from "../types/Category";
import User from "../Databases/Models/user.Models";
import { emitCategoryViewUpdate } from "../Utils/socketEmitters";
import NotificationService from "../Middlewares/LogMedillewares/notificationLogger";

const {
  CACHE_PREFIX,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  LIST_CACHE_TTL,
  CLOUDINARY_FOLDERS,
} = CATEGORY_CONSTANTS;

const buildListCacheKey = (query: any) =>
  `${CACHE_PREFIX}:list:${crypto
    .createHash("md5")
    .update(JSON.stringify(query))
    .digest("hex")}`;

const genCodeFromName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);

export default class CategoryService {
  public static async createCategory(
    req: Request,
    res: Response,
    next: NextFunction
  ): CategoryServiceResponse {
    try {
      const {
        name,
        title,
        description,
        code,
        offerText,
        priority = 0,
        isFeatured = false,
        isActive = true,
      } = req.body;
      const files = req.files as any;

      if (!name || !title || !offerText || !files?.imageUrl) {
        return next(new ApiError(400, "Missing required fields"));
      }

      const trimmedName = name.trim();
      const finalCode = code?.trim() || genCodeFromName(trimmedName);

      const categoryData: Partial<ICategory> = {
        name: trimmedName,
        title: title.trim(),
        description: description?.trim(),
        code: finalCode,
        offerText: offerText.trim(),
        priority: Number(priority) || 0,
        isFeatured: Boolean(isFeatured),
        isActive: Boolean(isActive),
        createdBy: (req as any).user?._id,
        updatedBy: (req as any).user?._id,
        imageUrl: ["temp"],
        bannerUrl: ["temp"],
      };

      const categories = await CategoryModel.insertMany([categoryData]);
      const category = categories[0];

      if (!category) {
        return next(new ApiError(500, "Failed to create category"));
      }

      process.nextTick(async () => {
        try {
          const imageFiles = Array.isArray(files.imageUrl)
            ? files.imageUrl
            : [files.imageUrl];
          const bannerFiles = files.bannerUrl
            ? Array.isArray(files.bannerUrl)
              ? files.bannerUrl
              : [files.bannerUrl]
            : [];

          const [imageResults, bannerResults] = await Promise.all([
            Promise.all(
              imageFiles.map((f: any) =>
                uploadToCloudinary(f.buffer, CLOUDINARY_FOLDERS.IMAGES)
              )
            ),
            bannerFiles.length
              ? Promise.all(
                bannerFiles.map((f: any) =>
                  uploadToCloudinary(f.buffer, CLOUDINARY_FOLDERS.BANNERS)
                )
              )
              : [],
          ]);

          await CategoryModel.updateOne(
            { _id: category._id },
            {
              imageUrl: imageResults.map((r) => r.secure_url),
              bannerUrl: bannerResults.map((r) => r.secure_url),
            }
          );

          // Send notification after image upload is complete
          const users = await User.find({ fcmToken: { $ne: null } }).select(
            "_id name fcmToken"
          );

          const notificationTitle = "New Category Added!";
          const body = `${category.title} has been added to the store.`;

          await NotificationService.sendNotificationToMultipleUsers(
            users.filter(u => u.fcmToken).map(u => ({
              _id: u._id.toString(),
              fcmToken: u.fcmToken as string,
              name: u.name
            })),
            notificationTitle,
            body,
            {
              type: "CATEGORY_CREATED",
              relatedEntityId: category._id.toString(),
              relatedEntityType: "Category",
              payload: {
                categoryId: category._id,
                image: imageResults.length > 0 ? imageResults[0].secure_url : null
              },

            }
          );
        } catch (err) {
          console.error("Upload error:", err);
        }
      });
      return handleResponse(req, res, 201, "Category created successfully", {
        _id: category._id,
        name: category.name,
        title: category.title,
        description: category.description,
        code: category.code,
        offerText: category.offerText,
        priority: category.priority,
        isFeatured: category.isFeatured,
        isActive: category.isActive,
        imageUrl: category.imageUrl,
        bannerUrl: category.bannerUrl,
      });
    } catch (error: any) {
      return next(
        new ApiError(500, `Failed to create category: ${error.message}`)
      );
    }
  }

  // Get all categories
  public static async getAllCategory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const {
        page = "1",
        limit = String(DEFAULT_LIMIT),
        sortBy = "priority",
        order = "desc",
        isActive,
        isFeatured,
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(
        MAX_LIMIT,
        Math.max(1, parseInt(String(limit), 10) || DEFAULT_LIMIT)
      );
      const skip = (pageNum - 1) * limitNum;

      const filters: Record<string, any> = {};
      if (typeof isActive !== "undefined")
        filters.isActive = String(isActive) === "true";
      if (typeof isFeatured !== "undefined")
        filters.isFeatured = String(isFeatured) === "true";

      const sortOrder: SortOrder =
        String(order).toLowerCase() === "asc" ? 1 : -1;
      const sortObj: { [key: string]: SortOrder } = {
        [String(sortBy)]: sortOrder,
      };

      const cacheKey = buildListCacheKey({
        page: pageNum,
        limit: limitNum,
        sortBy,
        order,
        isActive,
        isFeatured,
      });

      const cachedData = await getCache<any>(cacheKey);
      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Categories fetched from Redis cache",
          cachedData
        );
      }

      const [categories, total] = await Promise.all([
        CategoryModel.find(filters)
          .sort(sortObj)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        CategoryModel.countDocuments(filters),
      ]);

      const payload = {
        items: categories,
        pagination: {
          currentPage: pageNum,
          limit: limitNum,
          totalItems: total,
          totalPages: Math.ceil(total / limitNum),
        },
        meta: {
          sortedBy: sortBy,
          order,
          filters,
        },
      };

      setCache(cacheKey, payload, LIST_CACHE_TTL).catch(() => null);

      return handleResponse(
        req,
        res,
        200,
        "Categories fetched from MongoDB",
        payload
      );
    } catch (error: any) {
      console.error("Error retrieving categories:", error);
      return next(
        new ApiError(500, `Failed to retrieve categories: ${error.message}`)
      );
    }
  }

  public static async getCategoriesSimple(
    req: Request,
    res: Response,
    next: NextFunction
  ): CategoryServiceResponse {
    try {
      const {
        search = "",
        page = 1,
        limit = 10,
        isActive = "true",
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Extract User ID for Personalization (Optional Auth)
      let userId = (req as any).user?._id;
      if (!userId && req.headers.authorization) {
        try {
          const token = req.headers.authorization.split(" ")[1];
          if (token) {
            const decoded: any = jwtTokens.verify(token, process.env.USER_SECRET_KEY as string);
            userId = decoded._id;
          }
        } catch (e) {
          // Ignore invalid tokens for public feed
        }
      }

      let viewedCategoryIds: any[] = [];
      if (userId) {
        const user = await User.findById(userId).select("viewedCategories");
        if (user?.viewedCategories) {
          viewedCategoryIds = user.viewedCategories;
        }
      }

      let matchStage: any = { isActive: isActive === "true" };

      if (search && search.toString().trim()) {
        const searchRegex = new RegExp(search.toString().trim(), "i");
        matchStage.$or = [
          { name: { $regex: searchRegex } },
          { title: { $regex: searchRegex } },
          { code: { $regex: searchRegex } },
        ];
      }

      // Cache key (Personalized if userId exists)
      const cacheKey = `${CACHE_PREFIX}:simple:${crypto
        .createHash("md5")
        .update(JSON.stringify({ search, page, limit, isActive, userId: userId || "guest" }))
        .digest("hex")}`;

      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Categories retrieved from cache",
          cachedData
        );
      }

      // Aggregation pipeline
      const pipeline: any[] = [
        { $match: matchStage },

        {
          $addFields: {
            firstImage: {
              $cond: {
                if: {
                  $and: [
                    { $isArray: "$imageUrl" },
                    { $gt: [{ $size: "$imageUrl" }, 0] },
                  ],
                },
                then: { $arrayElemAt: ["$imageUrl", 0] },
                else: null,
              },
            },
            // Prioritize Recently Viewed
            isRecentlyViewed: {
              $cond: {
                if: { $in: ["$_id", viewedCategoryIds] },
                then: 1,
                else: 0
              }
            }
          },
        },

        {
          $project: {
            _id: 1,
            name: 1,
            imageUrl: "$firstImage",
            priority: 1,
            createdAt: 1,
            isRecentlyViewed: 1
          },
        },

        {
          $sort: {
            isRecentlyViewed: -1 as const, // Viewed first
            priority: -1 as const,
            createdAt: -1 as const,
          },
        },

        {
          $facet: {
            categories: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
          },
        },

        {
          $project: {
            categories: {
              $map: {
                input: "$categories",
                as: "category",
                in: {
                  _id: "$$category._id",
                  name: "$$category.name",
                  imageUrl: "$$category.imageUrl",
                },
              },
            },
            totalItems: {
              $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0],
            },
          },
        },
      ];

      const [result] = await CategoryModel.aggregate(pipeline);

      const totalCategories = result?.totalItems || 0;
      const categories = result?.categories || [];

      const responseData = {
        categories,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCategories / limitNum),
          totalItems: totalCategories,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < Math.ceil(totalCategories / limitNum),
          hasPrevPage: pageNum > 1,
        },
        search: search ? search.toString().trim() : "",
        meta: {
          aggregationUsed: true,
          performanceOptimized: true,
        },
      };

      await setCache(cacheKey, responseData, LIST_CACHE_TTL);

      return handleResponse(
        req,
        res,
        200,
        "Categories retrieved successfully using aggregation",
        responseData
      );
    } catch (error: any) {
      console.error("Get simple categories aggregation error:", error);
      return next(
        new ApiError(500, `Failed to retrieve categories: ${error.message}`)
      );
    }
  }

  // Get category by ID
  public static async getCategoryById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const { id } = req.params;

      if (!id) {
        return next(new ApiError(400, "Category ID is required"));
      }

      const cacheKey = `${CACHE_PREFIX}:single:${id}`;
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Category retrieved from cache",
          cachedData
        );
      }

      const pipeline: any[] = [
        { $match: { _id: id } },
        {
          $addFields: {
            imageCount: { $size: { $ifNull: ["$imageUrl", []] } },
            bannerCount: { $size: { $ifNull: ["$bannerUrl", []] } },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
            pipeline: [{ $project: { name: 1, email: 1 } }],
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedByUser",
            pipeline: [{ $project: { name: 1, email: 1 } }],
          },
        },
        {
          $addFields: {
            createdByUser: { $arrayElemAt: ["$createdByUser", 0] },
            updatedByUser: { $arrayElemAt: ["$updatedByUser", 0] },
          },
        },
      ];

      const [category] = await CategoryModel.aggregate(pipeline);

      if (!category) {
        return next(new ApiError(404, "Category not found"));
      }

      await setCache(cacheKey, category, LIST_CACHE_TTL);

      return handleResponse(
        req,
        res,
        200,
        "Category retrieved successfully",
        category
      );
    } catch (error: any) {
      console.error("Get category by ID error:", error);
      return next(
        new ApiError(500, `Failed to retrieve category: ${error.message}`)
      );
    }
  }

  public static async updateCategory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const { id } = req.params;
      const {
        name,
        title,
        description,
        code,
        offerText,
        priority,
        isFeatured,
        isActive,
      } = req.body;

      if (!id) {
        return next(new ApiError(400, "Category ID is required"));
      }

      const existingCategory = await CategoryModel.findById(id);
      if (!existingCategory) {
        return next(new ApiError(404, "Category not found"));
      }

      const files = req.files as any;
      let uploadedImageUrls: string[] = [];
      let uploadedBannerUrls: string[] = [];

      if (files && files.imageUrl) {
        const imageFiles = Array.isArray(files.imageUrl)
          ? files.imageUrl
          : [files.imageUrl];

        for (const imageFile of imageFiles) {
          const result = await uploadToCloudinary(
            imageFile.buffer,
            "categories/images"
          );
          uploadedImageUrls.push(result.secure_url);
        }
      }

      if (files && files.bannerUrl) {
        const bannerFiles = Array.isArray(files.bannerUrl)
          ? files.bannerUrl
          : [files.bannerUrl];

        for (const bannerFile of bannerFiles) {
          const result = await uploadToCloudinary(
            bannerFile.buffer,
            "categories/banners"
          );
          uploadedBannerUrls.push(result.secure_url);
        }
      }

      if (name && name !== existingCategory.name) {
        const conflictCategory = await CategoryModel.findOne({
          $and: [
            { _id: { $ne: id } },
            { $or: [{ name }, { code: code || genCodeFromName(name) }] },
          ],
        });

        if (conflictCategory) {
          return next(
            new ApiError(400, "Category with this name or code already exists")
          );
        }
      }

      const updateData: Partial<ICategory> = {
        updatedBy: (req as any).user?._id,
      };

      if (name !== undefined) updateData.name = name.trim();
      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined)
        updateData.description = description?.trim();
      if (code !== undefined)
        updateData.code =
          code.trim() || genCodeFromName(name || existingCategory.name);
      if (offerText !== undefined) updateData.offerText = offerText.trim();
      if (priority !== undefined) updateData.priority = Number(priority);
      if (isFeatured !== undefined) updateData.isFeatured = Boolean(isFeatured);
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      if (files && files.imageUrl && uploadedImageUrls.length > 0) {
        updateData.imageUrl = uploadedImageUrls;
      }
      if (files && files.bannerUrl && uploadedBannerUrls.length > 0) {
        updateData.bannerUrl = uploadedBannerUrls;
      }

      const updatedCategory = await CategoryModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      // Clear cache
      await Promise.all([
        deleteCache(`${CACHE_PREFIX}:single:${id}`),
        deleteCachePattern(`${CACHE_PREFIX}:list:*`),
        deleteCachePattern(`${CACHE_PREFIX}:simple:*`),
      ]);

      // Fire-and-forget: notify users about category update (similar to createCategory)
      process.nextTick(async () => {
        try {
          const users = await User.find({ fcmToken: { $ne: null } }).select(
            "_id name fcmToken"
          );

          if (!users || users.length === 0) return;

          const actorName = (req as any).user?.name || 'Admin';
          const updatedTitle = (updatedCategory as any)?.title || (updatedCategory as any)?.name || existingCategory.name;
          const notificationTitle = "Category Updated";
          const body = `${actorName} updated category: "${updatedTitle}"`;

          await NotificationService.sendNotificationToMultipleUsers(
            users.filter(u => u.fcmToken).map(u => ({
              _id: u._id.toString(),
              fcmToken: u.fcmToken as string,
              name: u.name
            })),
            notificationTitle,
            body,
            {
              type: "CATEGORY_UPDATED",
              relatedEntityId: id,
              relatedEntityType: "Category",
              payload: {
                categoryId: id,
                updatedBy: actorName,
                timestamp: new Date().toISOString(),
                image: (updatedCategory as any)?.imageUrl?.length > 0 ? (updatedCategory as any)?.imageUrl[0] : null
              }
            }
          );
        } catch (err) {
          console.error("Notification (updateCategory) error:", err);
        }
      });

      return handleResponse(
        req,
        res,
        200,
        "Category updated successfully",
        updatedCategory
      );
    } catch (error: any) {
      console.error("Update category error:", error);
      return next(
        new ApiError(500, `Failed to update category: ${error.message}`)
      );
    }
  }

  // Delete category (soft delete)
  public static async ActiovationCategory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const { id } = req.params;
      const { permanent = false } = req.query;

      if (!id) {
        return next(new ApiError(400, "Category ID is required"));
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return next(new ApiError(404, "Category not found"));
      }

      if (permanent === "true") {
        await CategoryModel.findByIdAndDelete(id);

        // Clear cache
        await Promise.all([
          deleteCache(`${CACHE_PREFIX}:single:${id}`),
          deleteCachePattern(`${CACHE_PREFIX}:list:*`),
          deleteCachePattern(`${CACHE_PREFIX}:simple:*`),
        ]);

        return handleResponse(req, res, 200, "Category permanently deleted", {
          deletedId: id,
        });
      } else {
        // Soft delete
        const updatedCategory = await CategoryModel.findByIdAndUpdate(
          id,
          {
            isActive: false,
            updatedBy: (req as any).user?._id,
          },
          { new: true }
        );

        // Clear cache
        await Promise.all([
          deleteCache(`${CACHE_PREFIX}:single:${id}`),
          deleteCachePattern(`${CACHE_PREFIX}:list:*`),
          deleteCachePattern(`${CACHE_PREFIX}:simple:*`),
        ]);

        return handleResponse(
          req,
          res,
          200,
          "Category deactivated successfully",
          updatedCategory
        );
      }
    } catch (error: any) {
      console.error("Delete category error:", error);
      return next(
        new ApiError(500, `Failed to delete category: ${error.message}`)
      );
    }
  }

  // Bulk toggle active status
  public static async bulkToggleActive(
    req: Request,
    res: Response,
    next: NextFunction
  ): CategoryServiceResponse {
    try {
      const { categoryIds, isActive } = req.body;

      if (
        !categoryIds ||
        !Array.isArray(categoryIds) ||
        categoryIds.length === 0
      ) {
        return next(new ApiError(400, "categoryIds array is required"));
      }

      if (typeof isActive !== "boolean") {
        return next(new ApiError(400, "isActive must be a boolean value"));
      }

      // Validate all category IDs exist
      const existingCategories = await CategoryModel.find({
        _id: { $in: categoryIds },
      });

      if (existingCategories.length !== categoryIds.length) {
        const foundIds = existingCategories.map((cat) => cat._id.toString());
        const missingIds = categoryIds.filter((id) => !foundIds.includes(id));
        return next(
          new ApiError(400, `Categories not found: ${missingIds.join(", ")}`)
        );
      }

      const updateResult = await CategoryModel.updateMany(
        { _id: { $in: categoryIds } },
        {
          isActive,
          updatedBy: (req as any).user?._id,
          updatedAt: new Date(),
        }
      );

      const updatedCategories = await CategoryModel.find(
        { _id: { $in: categoryIds } },
        { _id: 1, name: 1, isActive: 1 }
      );

      const cachePromises = [
        deleteCachePattern(`${CACHE_PREFIX}:list:*`),
        deleteCachePattern(`${CACHE_PREFIX}:simple:*`),
        ...categoryIds.map((id) => deleteCache(`${CACHE_PREFIX}:single:${id}`)),
      ];

      await Promise.all(cachePromises);

      return handleResponse(
        req,
        res,
        200,
        `Successfully ${isActive ? "activated" : "deactivated"} ${updateResult.modifiedCount
        } categories`,
        {
          modifiedCount: updateResult.modifiedCount,
          matchedCount: updateResult.matchedCount,
          updatedCategories,
          operation: isActive ? "activated" : "deactivated",
        }
      );
    } catch (error: any) {
      console.error("Bulk toggle active error:", error);
      return next(
        new ApiError(500, `Failed to bulk toggle categories: ${error.message}`)
      );
    }
  }

  public static addToRecentlyViewedCategories = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { categoryId } = req.params;
      const userId = (req as any).user?._id;

      if (!categoryId) {
        return next(new ApiError(400, "Category ID is required"));
      }

      if (!userId) {
        return next(new ApiError(401, "User not authenticated"));
      }

      // LIFO Logic
      await User.findByIdAndUpdate(userId, {
        $pull: { viewedCategories: categoryId }
      });

      await User.findByIdAndUpdate(userId, {
        $push: {
          viewedCategories: {
            $each: [categoryId],
            $position: 0,
            $slice: 15
          }
        }
      });

      // Invalidate Redis Cache
      await deleteCache(`recently_viewed_categories:${userId}`);

      // Emit real-time WebSocket event
      const categoryData = await CategoryModel.findById(categoryId)
        .select('_id name imageUrl')
        .lean();
      
      if (categoryData) {
        emitCategoryViewUpdate(userId.toString(), {
          _id: categoryData._id,
          name: categoryData.name,
          imageUrl: (categoryData as any).imageUrl?.[0] || null
        });
      }

      return handleResponse(req, res, 200, "Recently viewed category updated");
    }
  );

  public static getRecentlyViewedCategories = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id;

      if (!userId) {
        return next(new ApiError(401, "User not authenticated"));
      }

      const cacheKey = `recently_viewed_categories:${userId}`;
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Recently viewed categories fetched from cache",
          cachedData
        );
      }

      // Check if user has viewed categories
      const userCheck = await User.findById(userId).select('viewedCategories').lean();

      if (!userCheck || !userCheck.viewedCategories || userCheck.viewedCategories.length === 0) {
        return handleResponse(req, res, 200, "Recently viewed categories fetched successfully", []);
      }

      // Use aggregation for fast fetch
      const result = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(userId) } },
        {
          $project: {
            viewedCategories: { $slice: ["$viewedCategories", -15] } // Last 15 categories
          }
        },
        { $unwind: { path: "$viewedCategories", preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: "categories",
            localField: "viewedCategories",
            foreignField: "_id",
            as: "categoryData"
          }
        },
        { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: false } },
        {
          $project: {
            _id: "$categoryData._id",
            name: "$categoryData.name",
            imageUrl: { $arrayElemAt: ["$categoryData.imageUrl", 0] }
          }
        }
      ]);

      // Reverse to show most recent first
      result.reverse();

      // Cache for 10 minutes
      await setCache(cacheKey, result, 600);

      return handleResponse(
        req,
        res,
        200,
        "Recently viewed categories fetched successfully",
        result
      );
    }
  );
}

export class CategoryLogService {
  private static CACHE_PREFIX = "categoryLogs";
  private static CACHE_TTL = 1800;

  // Debug method to check database connection and data
  public static getDebugInfo = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const totalLogs = await CategoryLogModel.countDocuments({});
      const sampleLogs = await CategoryLogModel.find({}).limit(5).lean();

      return handleResponse(req, res, 200, "Debug info fetched", {
        totalLogs,
        sampleLogs,
        modelName: CategoryLogModel.modelName,
        collectionName: CategoryLogModel.collection.name,
      });
    }
  );

  public static getAllLogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        page = 1,
        limit = 20,
        search = "",
        action,
        userId,
        categoryId,
        startDate,
        endDate,
        sortBy = "createdAt",
        order = "desc",
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(100, parseInt(limit as string) || 20);
      const skip = (pageNum - 1) * limitNum;

      const cacheKey = `${this.CACHE_PREFIX}:all:${crypto
        .createHash("md5")
        .update(
          JSON.stringify({
            page,
            limit,
            search,
            action,
            userId,
            categoryId,
            startDate,
            endDate,
            sortBy,
            order,
          })
        )
        .digest("hex")}`;

      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Category logs fetched from cache",
          cachedData
        );
      }

      const matchStage: any = {};

      if (search && search.toString().trim()) {
        const searchRegex = new RegExp(search.toString().trim(), "i");
        matchStage.$or = [
          { "categoryDetails.name": { $regex: searchRegex } },
          { "userDetails.name": { $regex: searchRegex } },
          { action: { $regex: searchRegex } },
          { operation: { $regex: searchRegex } },
          { summary: { $regex: searchRegex } },
        ];
      }

      if (action) matchStage.action = action;
      if (userId && mongoose.isValidObjectId(userId))
        matchStage.performedBy = new mongoose.Types.ObjectId(userId as string);
      if (categoryId && mongoose.isValidObjectId(categoryId))
        matchStage.categoryId = new mongoose.Types.ObjectId(
          categoryId as string
        );

      if (startDate || endDate) {
        matchStage.timestamp = {};
        if (startDate)
          matchStage.timestamp.$gte = new Date(startDate as string);
        if (endDate) matchStage.timestamp.$lte = new Date(endDate as string);
      }

      const sortOrder = order === "asc" ? 1 : -1;
      const finalSortBy =
        sortBy === "createdAt" ? "timestamp" : (sortBy as string);
      const sortObj = { [finalSortBy]: sortOrder } as any;

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryDetails",
            pipeline: [{ $project: { name: 1, code: 1, imageUrl: 1 } }],
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "performedBy",
            foreignField: "_id",
            as: "userDetails",
            pipeline: [{ $project: { name: 1, email: 1 } }],
          },
        },
        {
          $addFields: {
            categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] },
            userInfo: { $arrayElemAt: ["$userDetails", 0] },
          },
        },
        {
          $project: {
            _id: 1,
            action: 1,
            operation: 1,
            summary: 1,
            timestamp: 1,
            oldData: 1,
            newData: 1,
            categoryInfo: {
              $cond: {
                if: { $ne: ["$categoryInfo", null] },
                then: "$categoryInfo",
                else: { name: "Unknown Category", code: "", imageUrl: [] },
              },
            },
            userInfo: {
              $cond: {
                if: { $ne: ["$userInfo", null] },
                then: "$userInfo",
                else: { name: "Unknown User", email: "" },
              },
            },
            createdAt: 1,
            updatedAt: 1,
          },
        },
        { $sort: sortObj },
        {
          $facet: {
            logs: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
          },
        },
      ];

      const [result] = await CategoryLogModel.aggregate(pipeline).exec();

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
          hasPrevPage: pageNum > 1,
        },
        filters: { search, action, userId, categoryId, startDate, endDate },
        meta: { sortBy, order, aggregationUsed: true },
      };

      await setCache(cacheKey, responseData, this.CACHE_TTL);

      return handleResponse(
        req,
        res,
        200,
        "Category logs fetched successfully",
        responseData
      );
    }
  );

  public static getLogById = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      if (!id || !mongoose.isValidObjectId(id)) {
        return next(new ApiError(400, "Invalid log ID"));
      }

      const cacheKey = `${this.CACHE_PREFIX}:single:${id}`;
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Category log fetched from cache",
          cachedData
        );
      }

      const pipeline: any[] = [
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "performedBy",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $addFields: {
            categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] },
            userInfo: { $arrayElemAt: ["$userDetails", 0] },
          },
        },
        {
          $project: {
            _id: 1,
            action: 1,
            operation: 1,
            summary: 1,
            timestamp: 1,
            oldData: 1,
            newData: 1,
            categoryInfo: {
              $cond: {
                if: { $ne: ["$categoryInfo", null] },
                then: "$categoryInfo",
                else: null,
              },
            },
            userInfo: {
              $cond: {
                if: { $ne: ["$userInfo", null] },
                then: "$userInfo",
                else: null,
              },
            },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ];

      const [log] = await CategoryLogModel.aggregate(pipeline).exec();

      if (!log) {
        return next(new ApiError(404, "Category log not found"));
      }

      await setCache(cacheKey, log, this.CACHE_TTL);

      return handleResponse(
        req,
        res,
        200,
        "Category log fetched successfully",
        log
      );
    }
  );

  public static getLogsByDateRange = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { startDate, endDate, action, limit = 50 } = req.query;

      if (!startDate || !endDate) {
        return next(new ApiError(400, "Start date and end date are required"));
      }

      const matchStage: any = {
        timestamp: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string),
        },
      };

      if (action) matchStage.action = action;

      const limitNum = Math.min(200, parseInt(limit as string) || 50);

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              action: "$action",
            },
            count: { $sum: 1 },
            logs: {
              $push: {
                _id: "$_id",
                summary: "$summary",
                timestamp: "$timestamp",
              },
            },
          },
        },
        {
          $group: {
            _id: "$_id.date",
            actions: {
              $push: {
                action: "$_id.action",
                count: "$count",
                logs: { $slice: ["$logs", 5] },
              },
            },
            totalCount: { $sum: "$count" },
          },
        },
        {
          $project: {
            _id: 0,
            date: "$_id",
            actions: 1,
            totalCount: 1,
          },
        },
        { $sort: { date: -1 } },
        { $limit: limitNum },
      ];

      const result = await CategoryLogModel.aggregate(pipeline).exec();

      return handleResponse(
        req,
        res,
        200,
        "Category date range logs fetched successfully",
        {
          dateRange: { startDate, endDate },
          data: result,
          totalDays: result.length,
        }
      );
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
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        return handleResponse(
          req,
          res,
          200,
          "Category log stats fetched from cache",
          cachedData
        );
      }

      const pipeline: any[] = [
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$action",
            count: { $sum: 1 },
            latestLog: { $max: "$timestamp" },
          },
        },
        {
          $group: {
            _id: null,
            actions: {
              $push: {
                action: "$_id",
                count: "$count",
                latestLog: "$latestLog",
              },
            },
            totalLogs: { $sum: "$count" },
          },
        },
      ];

      const [stats] = (await CategoryLogModel.aggregate(pipeline).exec()) || [
        null,
      ];

      const responseData = {
        period,
        dateRange: { startDate, endDate },
        totalLogs: stats?.totalLogs || 0,
        actionBreakdown: stats?.actions || [],
        generatedAt: new Date(),
      };

      await setCache(cacheKey, responseData, 600);

      return handleResponse(
        req,
        res,
        200,
        "Category log statistics fetched successfully",
        responseData
      );
    }
  );


}
