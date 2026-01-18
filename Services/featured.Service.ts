/*
┌────────────────────────────────────────────────────────────────────────┐
│  Featured Service - Logic for featured medicines and their logs.       │
│  Manages featured items, caching, audit logging, and stats retrieval.  │
└────────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import FeaturedMedicine from "../Databases/Models/FeaturedMedicine.model";
import FeaturedMedicineLog from "../Databases/Models/feturedLog.model";
import { getCache, setCache, deleteCache } from "../Utils/cache";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import crypto from "crypto";
import mongoose from "mongoose";
import NotificationService from "../Middlewares/LogMedillewares/notificationLogger";
import { processPrescriptionBuffer } from "./ocr.Service";
import User from "../Databases/Models/user.Models";

const CACHE_KEY = "featuredMedicines";
const CACHE_TTL = 3000;

export default class FeaturedMedicineService {
  //CREATE-----------------------------------------------------------------
  public static createFeaturedMedicine = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        title,
        remarks,
        description = "",
        category,
        discount = 0,
        stock,
        featured = false,
        ratings = 0,
        createdBy,
      } = req.body;

      const createdById = (req as any).user?._id ?? createdBy;
      if (req.file) { const result = await processPrescriptionBuffer((req.file as Express.Multer.File).buffer); return res.json(result); }
      if (!title?.trim() || !category || stock == null) {
        return next(new ApiError(400, "Missing or invalid required fields"));
      }

      if (!mongoose.isValidObjectId(category)) {
        return next(new ApiError(400, "Invalid category ID"));
      }

      // image upload
      let imageUrl = "";
      if (req.file) {
        try {
          const uploadResult = await uploadToCloudinary(
            (req.file as Express.Multer.File).buffer,
            "Epharma/medicines"
          );
          imageUrl = uploadResult.secure_url;
        } catch (error) {
          console.error("Image upload error:", error);
          return next(new ApiError(500, "Failed to upload image"));
        }
      } else if (req.body.imageUrl?.trim()) {
        imageUrl = req.body.imageUrl.trim();
      } else {
        return next(
          new ApiError(400, "Either upload an image file or provide imageUrl")
        );
      }

      // Check for existing medicine with same title
      const existingMedicine = await FeaturedMedicine.findOne({
        title: title.trim(),
      });
      if (existingMedicine) {
        return next(
          new ApiError(409, "Featured medicine with same title already exists")
        );
      }

      const cleanData = {
        title: title.trim(),
        description: description.trim(),
        category,
        remarks,
        discount: Math.min(100, Math.max(0, discount)),
        stock: Math.max(0, stock),
        imageUrl,
        featured: Boolean(featured),
        ratings: Math.min(5, Math.max(0, ratings)),
        createdBy: createdById,
      };

      const newMedicine = await FeaturedMedicine.create(cleanData);

      await deleteCache(CACHE_KEY).catch(() => null);

      // Fire-and-forget: notify users about new featured medicine with a friendly, high-conversion message
      process.nextTick(async () => {
        try {
          const users = await User.find({ fcmToken: { $ne: null } }).select(
            "_id name fcmToken"
          );

          if (!users || users.length === 0) return;

          const title = `Just Arrived: ${newMedicine.title}!`;
          const body = `Grab ${newMedicine.title} now — limited stock available. Enjoy exclusive savings and fast delivery. Tap to view and order before it's gone!`;

          await NotificationService.sendNotificationToMultipleUsers(
            users.filter(u => u.fcmToken).map(u => ({
              _id: u._id.toString(),
              fcmToken: u.fcmToken as string,
              name: u.name
            })),
            title,
            body,
            {
              type: "FEATURED_CREATED",
              relatedEntityId: newMedicine._id.toString(),
              relatedEntityType: "FeaturedMedicine",
              payload: { 
                medicineId: newMedicine._id,
                image: newMedicine.imageUrl || null
              }
            }
          );
        } catch (err) {
          console.error("Notification (createFeaturedMedicine) error:", err);
        }
      });

      return handleResponse(
        req,
        res,
        201,
        "Featured medicine created successfully",
        newMedicine
      );
    }
  );

  // ALL GET -----------------------------------------------------
  public static getFeaturedMedicines = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const cachedData = await getCache<{ data: any[]; checksum: string }>(
          CACHE_KEY
        );
        if (cachedData) {
          return handleResponse(
            req,
            res,
            200,
            "Data fetched from Redis Cache",
            cachedData
          );
        }

        const medicines = await FeaturedMedicine.aggregate([
          {
            $lookup: {
              from: "categories",
              localField: "category",
              foreignField: "_id",
              as: "categoryDetails",
            },
          },
          {
            $addFields: {
              categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] },
              discountValue: {
                $round: [
                  { $multiply: ["$stock", { $divide: ["$discount", 100] }] },
                  2,
                ],
              },
              effectivePrice: {
                $round: [
                  {
                    $multiply: [
                      "$stock",
                      { $divide: [{ $subtract: [100, "$discount"] }, 100] },
                    ],
                  },
                  2,
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              description: 1,
              category: {
                $cond: {
                  if: { $ne: ["$categoryInfo", null] },
                  then: "$categoryInfo.name",
                  else: "Unknown Category"
                }
              },
              categoryId: "$category",
              stock: 1,
              discount: 1,
              discountValue: 1,
              effectivePrice: 1,
              imageUrl: 1,
              ratings: 1,
              featured: 1,
              createdAt: 1,
            },
          },
          { $sort: { createdAt: -1 } },
        ]);

        const checksum = crypto
          .createHash("sha256")
          .update(JSON.stringify(medicines))
          .digest("hex");

        const payload = { data: medicines, checksum };

        await setCache(CACHE_KEY, payload, CACHE_TTL);

        return handleResponse(
          req,
          res,
          200,
          " Data fetched from MongoDB",
          payload
        );
      } catch (error: any) {
        console.error("Redis/Mongo Fetch Error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  //UPDATE ------------------------------------------------------
  public static updateFeaturedMedicine = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      const updates = req.body;

      if (!id) return next(new ApiError(400, "Invalid medicine ID"));

      const allowedFields = [
        "title",
        "description",
        "category",
        "discount",
        "stock",
        "imageUrl",
        "featured",
        "ratings",
        "updatedBy",
        "remarks",
      ];

      // Filter allowed fields
      for (const key in updates) {
        if (!allowedFields.includes(key)) delete updates[key];
      }

      // Handle image upload if new file is provided
      if (req.file) {
        try {
          const uploadResult = await uploadToCloudinary(
            (req.file as Express.Multer.File).buffer,
            "Epharma/medicines"
          );
          updates.imageUrl = uploadResult.secure_url;
        } catch (error) {
          console.error("Image upload error:", error);
          return next(new ApiError(500, "Failed to upload image"));
        }
      }

      const updatedMedicine = await FeaturedMedicine.findByIdAndUpdate(
        id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedMedicine) return next(new ApiError(404, "Medicine not found"));

      await deleteCache(CACHE_KEY).catch(() => null);

      // Fire-and-forget: notify users about featured medicine update with an engaging message
      process.nextTick(async () => {
        try {
          const users = await User.find({ fcmToken: { $ne: null } }).select(
            "_id name fcmToken"
          );

          if (!users || users.length === 0) return;

          const titleText = (updatedMedicine as any).title || "An item";
          const title = `Update: ${titleText} just got better!`;
          const body = `Good news! ${titleText} has been updated — improved details, availability or savings may await. Tap to check the latest offer and secure yours.`;

          await NotificationService.sendNotificationToMultipleUsers(
            users.filter(u => u.fcmToken).map(u => ({
              _id: u._id.toString(),
              fcmToken: u.fcmToken as string,
              name: u.name
            })),
            title,
            body,
            {
              type: "FEATURED_UPDATED",
              relatedEntityId: updatedMedicine._id.toString(),
              relatedEntityType: "FeaturedMedicine",
              payload: { 
                medicineId: updatedMedicine._id,
                image: (updatedMedicine as any).imageUrl || null
              }
            }
          );
        } catch (err) {
          console.error("Notification (updateFeaturedMedicine) error:", err);
        }
      });

      return handleResponse(
        req,
        res,
        200,
        "Medicine updated successfully",
        updatedMedicine
      );
    }
  );

  // delete ------------------------------------------------------
  public static deleteFeaturedMedicine = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      if (!id) return next(new ApiError(400, "Invalid medicine ID"));

      const deletedMedicine = await FeaturedMedicine.findByIdAndDelete(id);
      if (!deletedMedicine) {
        return next(new ApiError(404, "Medicine not found"));
      }
      await deleteCache(CACHE_KEY).catch(() => null);
      return handleResponse(
        req,
        res,
        200,
        "Medicine deleted successfully",
        deletedMedicine
      );
    }
  );
}

export class FeaturedMedicineLogService {
  private static CACHE_PREFIX = "featuredLogs";
  private static CACHE_TTL = 1800;

  public static getAllLogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        page = 1,
        limit = 20,
        search = "",
        action,
        userId,
        medicineId,
        startDate,
        endDate,
        sortBy = "createdAt",
        order = "desc"
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(100, parseInt(limit as string) || 20);
      const skip = (pageNum - 1) * limitNum;

      const cacheKey = `${this.CACHE_PREFIX}:all:${crypto
        .createHash("md5")
        .update(JSON.stringify({ page, limit, search, action, userId, medicineId, startDate, endDate, sortBy, order }))
        .digest("hex")}`;

      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        return handleResponse(req, res, 200, "Logs fetched from cache", cachedData);
      }

      const matchStage: any = {};

      if (search && search.toString().trim()) {
        const searchRegex = new RegExp(search.toString().trim(), "i");
        matchStage.$or = [
          { "medicineDetails.title": { $regex: searchRegex } },
          { "userDetails.name": { $regex: searchRegex } },
          { action: { $regex: searchRegex } },
          { operation: { $regex: searchRegex } },
          { summary: { $regex: searchRegex } }
        ];
      }

      if (action) matchStage.action = action;
      if (userId && mongoose.isValidObjectId(userId)) matchStage.performedBy = new mongoose.Types.ObjectId(userId as string);
      if (medicineId && mongoose.isValidObjectId(medicineId)) matchStage.medicineId = new mongoose.Types.ObjectId(medicineId as string);

      if (startDate || endDate) {
        matchStage.timestamp = {};
        if (startDate) matchStage.timestamp.$gte = new Date(startDate as string);
        if (endDate) matchStage.timestamp.$lte = new Date(endDate as string);
      }

      const sortOrder = order === "asc" ? 1 : -1;
      const finalSortBy = sortBy === "createdAt" ? "timestamp" : sortBy as string;
      const sortObj = { [finalSortBy]: sortOrder } as any;

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $lookup: {
            from: "featuredmedicines",
            localField: "medicineId",
            foreignField: "_id",
            as: "medicineDetails",
            pipeline: [{ $project: { title: 1, imageUrl: 1, stock: 1 } }]
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
            medicineInfo: { $arrayElemAt: ["$medicineDetails", 0] },
            userInfo: { $arrayElemAt: ["$userDetails", 0] }
          }
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
            medicineInfo: {
              $cond: {
                if: { $ne: ["$medicineInfo", null] },
                then: "$medicineInfo",
                else: { title: "Unknown Medicine", imageUrl: "", stock: 0 }
              }
            },
            userInfo: {
              $cond: {
                if: { $ne: ["$userInfo", null] },
                then: "$userInfo",
                else: { name: "Unknown User", email: "" }
              }
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

      const [result] = await FeaturedMedicineLog.aggregate(pipeline);

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
        filters: { search, action, userId, medicineId, startDate, endDate },
        meta: { sortBy, order, aggregationUsed: true }
      };

      await setCache(cacheKey, responseData, this.CACHE_TTL);

      return handleResponse(req, res, 200, "Logs fetched successfully", responseData);
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
        return handleResponse(req, res, 200, "Log fetched from cache", cachedData);
      }

      const pipeline: any[] = [
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        {
          $lookup: {
            from: "featuredmedicines",
            localField: "medicineId",
            foreignField: "_id",
            as: "medicineDetails"
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
            medicineInfo: { $arrayElemAt: ["$medicineDetails", 0] },
            userInfo: { $arrayElemAt: ["$userDetails", 0] }
          }
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
            medicineInfo: {
              $cond: {
                if: { $ne: ["$medicineInfo", null] },
                then: "$medicineInfo",
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

      const [log] = await FeaturedMedicineLog.aggregate(pipeline);

      if (!log) {
        return next(new ApiError(404, "Log not found"));
      }

      await setCache(cacheKey, log, this.CACHE_TTL);

      return handleResponse(req, res, 200, "Log fetched successfully", log);
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
          $lte: new Date(endDate as string)
        }
      };

      if (action) matchStage.action = action;

      const limitNum = Math.min(200, parseInt(limit as string) || 50);

      const pipeline: any[] = [
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              action: "$action"
            },
            count: { $sum: 1 },
            logs: { $push: { _id: "$_id", summary: "$summary", timestamp: "$timestamp" } }
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

      const result = await FeaturedMedicineLog.aggregate(pipeline);

      return handleResponse(req, res, 200, "Date range logs fetched successfully", {
        dateRange: { startDate, endDate },
        data: result,
        totalDays: result.length
      });
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
        return handleResponse(req, res, 200, "Stats fetched from cache", cachedData);
      }

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
            latestLog: { $max: "$timestamp" }
          }
        },
        {
          $group: {
            _id: null,
            actions: {
              $push: {
                action: "$_id",
                count: "$count",
                latestLog: "$latestLog"
              }
            },
            totalLogs: { $sum: "$count" }
          }
        }
      ];

      const [stats] = await FeaturedMedicineLog.aggregate(pipeline);

      const responseData = {
        period,
        dateRange: { startDate, endDate },
        totalLogs: stats?.totalLogs || 0,
        actionBreakdown: stats?.actions || [],
        generatedAt: new Date()
      };

      await setCache(cacheKey, responseData, 600);

      return handleResponse(req, res, 200, "Log statistics fetched successfully", responseData);
    }
  );
}