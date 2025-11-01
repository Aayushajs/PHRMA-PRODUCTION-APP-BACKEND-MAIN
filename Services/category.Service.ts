import { CategoryModel } from "../Databases/Models/Category.model";
import { Request, Response, NextFunction } from "express";
import type { SortOrder } from "mongoose";
import { getCache, setCache, deleteCache } from "../Utils/cache";
import crypto from "crypto";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import {
  ICategory,
  CategoryServiceResponse,
  CATEGORY_CONSTANTS,
} from "../types/Category";

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
  // Create new category
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

      if (!name || !title || !offerText) {
        return next(
          new ApiError(400, "Required fields: name, title, offerText")
        );
      }

      const files = req.files as any;
      if (!files || !files.imageUrl || !files.bannerUrl) {
        return next(
          new ApiError(400, "At least one image (imageUrl) is required")
        );
      }

      const existingCategory = await CategoryModel.findOne({
        $or: [{ name }, { code }],
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name or code already exists",
        });
      }

      // Upload images to Cloudinary
      let uploadedImageUrls: string[] = [];
      let uploadedBannerUrls: string[] = [];

      if (files.imageUrl) {
        const imageFiles = Array.isArray(files.imageUrl)
          ? files.imageUrl
          : [files.imageUrl];

        for (const imageFile of imageFiles) {
          const result = await uploadToCloudinary(
            imageFile.buffer,
            CLOUDINARY_FOLDERS.IMAGES
          );
          uploadedImageUrls.push(result.secure_url);
        }
      }

      if (files.bannerUrl) {
        const bannerFiles = Array.isArray(files.bannerUrl)
          ? files.bannerUrl
          : [files.bannerUrl];

        for (const bannerFile of bannerFiles) {
          const result = await uploadToCloudinary(
            bannerFile.buffer,
            CLOUDINARY_FOLDERS.BANNERS
          );
          uploadedBannerUrls.push(result.secure_url);
        }
      }

      const categoryData: Partial<ICategory> = {
        name: name.trim(),
        title: title.trim(),
        description: description?.trim(),
        imageUrl: uploadedImageUrls,
        code: code?.trim() || genCodeFromName(name),
        bannerUrl: uploadedBannerUrls,
        offerText: offerText.trim(),
        priority: Number(priority) || 0,
        isFeatured: Boolean(isFeatured),
        isActive: Boolean(isActive),
        createdBy: (req as any).user?._id || undefined,
        updatedBy: (req as any).user?._id || undefined,
      };

      const category = new CategoryModel(categoryData);
      await category.save();

      // Clear cache
      await deleteCache(`${CACHE_PREFIX}:list:*`).catch(() => null);
      await deleteCache(`${CACHE_PREFIX}:single:${category._id}`).catch(
        () => null
      );

      return handleResponse(req, res, 201, "Category created successfully", {
        _id: category._id,
        name: category.name,
        title: category.title,
        description: category.description,
        imageUrl: uploadedImageUrls,
        bannerUrl: uploadedBannerUrls,
        code: category.code,
        offerText: category.offerText,
        priority: category.priority,
        isFeatured: category.isFeatured,
        isActive: category.isActive,
      });
    } catch (error: any) {
      console.error("Category creation error:", error);
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
      const { search = "", page = 1, limit = 10, isActive = true } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 10;
      const skip = (pageNum - 1) * limitNum;

      let matchStage: any = { isActive: isActive === "true" };

      if (search && search.toString().trim()) {
        const searchRegex = new RegExp(search.toString().trim(), "i");
        matchStage.$or = [
          { name: { $regex: searchRegex } },
          { title: { $regex: searchRegex } },
          { code: { $regex: searchRegex } },
        ];
      }

      // Cache key
      const cacheKey = `${CACHE_PREFIX}:simple:${crypto
        .createHash("md5")
        .update(JSON.stringify({ search, page, limit, isActive }))
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
          },
        },

        {
          $project: {
            _id: 1,
            name: 1,
            imageUrl: "$firstImage",
            priority: 1,
            createdAt: 1,
          },
        },

        {
          $sort: {
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
      let uploadedImageUrls: string[] = [...(existingCategory.imageUrl || [])];
      let uploadedBannerUrls: string[] = [
        ...(existingCategory.bannerUrl || []),
      ];

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

      if (files && files.imageUrl) updateData.imageUrl = uploadedImageUrls;
      if (files && files.bannerUrl) updateData.bannerUrl = uploadedBannerUrls;

      const updatedCategory = await CategoryModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      // Clear cache
      await Promise.all([
        deleteCache(`${CACHE_PREFIX}:single:${id}`),
        deleteCache(`${CACHE_PREFIX}:list:*`),
        deleteCache(`${CACHE_PREFIX}:simple:*`),
      ]);

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
  public static async deleteCategory(
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
          deleteCache(`${CACHE_PREFIX}:list:*`),
          deleteCache(`${CACHE_PREFIX}:simple:*`),
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
          deleteCache(`${CACHE_PREFIX}:list:*`),
          deleteCache(`${CACHE_PREFIX}:simple:*`),
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
        deleteCache(`${CACHE_PREFIX}:list:*`),
        deleteCache(`${CACHE_PREFIX}:simple:*`),
        ...categoryIds.map((id) => deleteCache(`${CACHE_PREFIX}:single:${id}`)),
      ];

      await Promise.all(cachePromises);

      return handleResponse(
        req,
        res,
        200,
        `Successfully ${isActive ? "activated" : "deactivated"} ${
          updateResult.modifiedCount
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
}
