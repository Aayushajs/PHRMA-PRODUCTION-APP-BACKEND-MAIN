/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Log Service - Logic for managing notification history.  │
│  Handles retrieval, filtering, stats, and read status for logs.       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import NotificationLogModel from "@models/notificationLog.model";
import { ApiError } from "@utils/ApiError";
import { handleResponse } from "@utils/handleResponse";
import { catchAsyncErrors } from "@utils/catchAsyncErrors";
import {
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
} from "@utils/cache";
import mongoose from "mongoose";
import crypto from "crypto";

const CACHE_PREFIX = "notificationLogs";
const CACHE_TTL = 1800; // 30 minutes

export default class NotificationLogService {
  public static getActiveLogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        page = 1,
        limit = 20,
        type,
        userId,
        startDate,
        endDate,
        sortBy = "sentAt",
        order = "desc",
        isRead,
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(100, parseInt(limit as string) || 20);
      const skip = (pageNum - 1) * limitNum;


      const cacheKey = `${CACHE_PREFIX}:active:${crypto
        .createHash("md5")
        .update(
          JSON.stringify({
            page,
            limit,
            type,
            userId,
            startDate,
            endDate,
            sortBy,
            order,
            isRead,
          })
        )
        .digest("hex")}`;

      try {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          return handleResponse(
            req,
            res,
            200,
            "Active notification logs fetched from cache",
            cachedData
          );
        }

        const matchStage: any = { status: "SENT" };

        if (type) matchStage.type = type;

        if (userId && mongoose.isValidObjectId(userId)) {
          matchStage.userId = userId;
        }

        if (isRead !== undefined) {
          matchStage.isRead = isRead === "true";
        }

        if (startDate || endDate) {
          matchStage.sentAt = {};
          if (startDate) matchStage.sentAt.$gte = new Date(startDate as string);
          if (endDate) matchStage.sentAt.$lte = new Date(endDate as string);
        }

        const sortOrder = order === "asc" ? 1 : -1;
        const sortObj = { [sortBy as string]: sortOrder } as any;

        const pipeline: any[] = [
          { $match: matchStage },

          {
            $lookup: {
              from: "categories",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "categoryDetails",
              pipeline: [{ $project: { _id: 1, name: 1, isActive: 1 } }],
            },
          },
          {
            $lookup: {
              from: "advertisements",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "advertisementDetails",
              pipeline: [{ $project: { _id: 1, title: 1, isActive: 1 } }],
            },
          },
          {
            $lookup: {
              from: "featuredmedicines",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "medicineDetails",
              pipeline: [{ $project: { _id: 1, title: 1, featured: 1 } }],
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "userDetails",
              pipeline: [{ $project: { name: 1, email: 1 } }],
            },
          },

          {
            $addFields: {
              relatedEntity: {
                $cond: [
                  { $eq: ["$relatedEntityType", "Category"] },
                  { $arrayElemAt: ["$categoryDetails", 0] },
                  {
                    $cond: [
                      { $eq: ["$relatedEntityType", "Advertisement"] },
                      { $arrayElemAt: ["$advertisementDetails", 0] },
                      {
                        $cond: [
                          { $eq: ["$relatedEntityType", "FeaturedMedicine"] },
                          { $arrayElemAt: ["$medicineDetails", 0] },
                          null,
                        ],
                      },
                    ],
                  },
                ],
              },
              userInfo: { $arrayElemAt: ["$userDetails", 0] },
            },
          },

          {
            $match: {
              $or: [
                { relatedEntityId: { $exists: false } },
                { relatedEntityType: { $exists: false } },

                {
                  $and: [
                    { relatedEntityType: "Category" },
                    { "relatedEntity.isActive": true },
                  ],
                },

                {
                  $and: [
                    { relatedEntityType: "Advertisement" },
                    { "relatedEntity.isActive": true },
                  ],
                },

                {
                  $and: [
                    { relatedEntityType: "FeaturedMedicine" },
                    { relatedEntity: { $ne: null } },
                  ],
                },

                { relatedEntityType: "User" },
              ],
            },
          },

          {
            $project: {
              _id: 1,
              type: 1,
              title: 1,
              body: 1,
              relatedEntityType: 1,
              status: 1,
              payload: 1,
              sentAt: 1,
              readAt: 1,
              isRead: 1,
              createdAt: 1,
              relatedEntity: {
                $cond: {
                  if: { $ne: ["$relatedEntity", null] },
                  then: {
                    _id: "$relatedEntity._id",
                    name: {
                      $ifNull: ["$relatedEntity.name", "$relatedEntity.title"],
                    },
                    isActive: {
                      $ifNull: [
                        "$relatedEntity.isActive",
                        "$relatedEntity.featured",
                        true,
                      ],
                    },
                  },
                  else: null,
                },
              },
              userInfo: {
                $cond: {
                  if: { $ne: ["$userInfo", null] },
                  then: "$userInfo",
                  else: { name: "Unknown User", email: "" },
                },
              },
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

        const [result] = await NotificationLogModel.aggregate(pipeline);

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
          filters: { type, userId, startDate, endDate, isRead },
          meta: {
            sortBy,
            order,
            note: "Only showing logs for active entities",
            cacheStatus: "fresh_from_db",
          },
        };

        await setCache(cacheKey, responseData, CACHE_TTL);

        return handleResponse(
          req,
          res,
          200,
          "Active notification logs fetched successfully",
          responseData
        );
      } catch (error: any) {
        console.error("Get active logs error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  public static getUserLogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      const {
        page = 1,
        limit = 20,
        type,
        isRead,
        startDate,
        endDate,
        sortBy = "sentAt",
        order = "desc",
      } = req.query;

      if (!userId || !mongoose.isValidObjectId(userId)) {
        return next(new ApiError(400, "Valid user ID is required"));
      }

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(100, parseInt(limit as string) || 20);
      const skip = (pageNum - 1) * limitNum;

      const cacheKey = `${CACHE_PREFIX}:user:${userId}:${crypto
        .createHash("md5")
        .update(
          JSON.stringify({
            page,
            limit,
            type,
            isRead,
            startDate,
            endDate,
            sortBy,
            order,
          })
        )
        .digest("hex")}`;

      try {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          return handleResponse(
            req,
            res,
            200,
            "User notification logs fetched from cache",
            cachedData
          );
        }

        const matchStage: any = {
          userId: userId,
          status: "SENT",
        };

        if (type) matchStage.type = type;
        if (isRead !== undefined) matchStage.isRead = isRead === "true";

        if (startDate || endDate) {
          matchStage.sentAt = {};
          if (startDate) matchStage.sentAt.$gte = new Date(startDate as string);
          if (endDate) matchStage.sentAt.$lte = new Date(endDate as string);
        }

        const sortOrder = order === "asc" ? 1 : -1;
        const sortObj = { [sortBy as string]: sortOrder } as any;

        const pipeline: any[] = [
          { $match: matchStage },

          {
            $lookup: {
              from: "categories",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "categoryDetails",
              pipeline: [{ $project: { _id: 1, name: 1, isActive: 1 } }],
            },
          },
          {
            $lookup: {
              from: "advertisements",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "advertisementDetails",
              pipeline: [{ $project: { _id: 1, title: 1, isActive: 1 } }],
            },
          },
          {
            $lookup: {
              from: "featuredmedicines",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "medicineDetails",
              pipeline: [{ $project: { _id: 1, title: 1 } }],
            },
          },

          {
            $addFields: {
              relatedEntity: {
                $cond: [
                  { $eq: ["$relatedEntityType", "Category"] },
                  { $arrayElemAt: ["$categoryDetails", 0] },
                  {
                    $cond: [
                      { $eq: ["$relatedEntityType", "Advertisement"] },
                      { $arrayElemAt: ["$advertisementDetails", 0] },
                      {
                        $cond: [
                          { $eq: ["$relatedEntityType", "FeaturedMedicine"] },
                          { $arrayElemAt: ["$medicineDetails", 0] },
                          null,
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },

          {
            $match: {
              $or: [
                { relatedEntityId: { $exists: false } },
                { relatedEntityType: { $exists: false } },
                {
                  $and: [
                    { relatedEntityType: "Category" },
                    { "relatedEntity.isActive": true },
                  ],
                },
                {
                  $and: [
                    { relatedEntityType: "Advertisement" },
                    { "relatedEntity.isActive": true },
                  ],
                },
                {
                  $and: [
                    { relatedEntityType: "FeaturedMedicine" },
                    { relatedEntity: { $ne: null } },
                  ],
                },
                { relatedEntityType: "User" },
              ],
            },
          },

          {
            $project: {
              _id: 1,
              type: 1,
              title: 1,
              body: 1,
              relatedEntityType: 1,
              status: 1,
              payload: 1,
              sentAt: 1,
              readAt: 1,
              isRead: 1,
              createdAt: 1,
              relatedEntity: {
                $cond: {
                  if: { $ne: ["$relatedEntity", null] },
                  then: {
                    _id: "$relatedEntity._id",
                    name: {
                      $ifNull: ["$relatedEntity.name", "$relatedEntity.title"],
                    },
                  },
                  else: null,
                },
              },
            },
          },

          { $sort: sortObj },

          {
            $facet: {
              logs: [{ $skip: skip }, { $limit: limitNum }],
              totalCount: [{ $count: "count" }],
              unreadCount: [{ $match: { isRead: false } }, { $count: "count" }],
            },
          },
        ];

        const [result] = await NotificationLogModel.aggregate(pipeline);

        const totalLogs = result?.totalCount[0]?.count || 0;
        const unreadLogs = result?.unreadCount[0]?.count || 0;
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
          stats: {
            totalLogs,
            unreadLogs,
            readLogs: totalLogs - unreadLogs,
          },
          filters: { type, isRead, startDate, endDate },
          meta: {
            sortBy,
            order,
            userId,
            cacheStatus: "fresh_from_db",
          },
        };

        await setCache(cacheKey, responseData, CACHE_TTL);

        return handleResponse(
          req,
          res,
          200,
          "User notification logs fetched successfully",
          responseData
        );
      } catch (error: any) {
        console.error("Get user logs error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  public static getLogById = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      if (!id || !mongoose.isValidObjectId(id)) {
        return next(new ApiError(400, "Valid log ID is required"));
      }

      const cacheKey = `${CACHE_PREFIX}:single:${id}`;

      try {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          return handleResponse(
            req,
            res,
            200,
            "Notification log fetched from cache",
            cachedData
          );
        }

        const pipeline: any[] = [
          { $match: { _id: new mongoose.Types.ObjectId(id) } },

          {
            $lookup: {
              from: "categories",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "categoryDetails",
            },
          },
          {
            $lookup: {
              from: "advertisements",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "advertisementDetails",
            },
          },
          {
            $lookup: {
              from: "featuredmedicines",
              localField: "relatedEntityId",
              foreignField: "_id",
              as: "medicineDetails",
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "userDetails",
              pipeline: [{ $project: { name: 1, email: 1, _id: 1 } }],
            },
          },

          {
            $addFields: {
              relatedEntity: {
                $cond: [
                  { $eq: ["$relatedEntityType", "Category"] },
                  { $arrayElemAt: ["$categoryDetails", 0] },
                  {
                    $cond: [
                      { $eq: ["$relatedEntityType", "Advertisement"] },
                      { $arrayElemAt: ["$advertisementDetails", 0] },
                      {
                        $cond: [
                          { $eq: ["$relatedEntityType", "FeaturedMedicine"] },
                          { $arrayElemAt: ["$medicineDetails", 0] },
                          null,
                        ],
                      },
                    ],
                  },
                ],
              },
              userInfo: { $arrayElemAt: ["$userDetails", 0] },
            },
          },

          {
            $project: {
              _id: 1,
              type: 1,
              title: 1,
              body: 1,
              relatedEntityType: 1,
              status: 1,
              payload: 1,
              fcmToken: 1,
              sentAt: 1,
              readAt: 1,
              isRead: 1,
              createdAt: 1,
              updatedAt: 1,
              relatedEntity: {
                $cond: {
                  if: { $ne: ["$relatedEntity", null] },
                  then: "$relatedEntity",
                  else: null,
                },
              },
              userInfo: {
                $cond: {
                  if: { $ne: ["$userInfo", null] },
                  then: "$userInfo",
                  else: { name: "Unknown User", email: "" },
                },
              },
            },
          },
        ];

        const [log] = await NotificationLogModel.aggregate(pipeline);

        if (!log) {
          return next(new ApiError(404, "Notification log not found"));
        }

        await setCache(cacheKey, log, CACHE_TTL);

        return handleResponse(
          req,
          res,
          200,
          "Notification log fetched successfully",
          log
        );
      } catch (error: any) {
        console.error("Get log by ID error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  public static markAsRead = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;
      const userId = (req as any).user?._id || req.body.userId;

      if (!id || !mongoose.isValidObjectId(id)) {
        return next(new ApiError(400, "Valid log ID is required"));
      }

      if (!userId) {
        return next(new ApiError(400, "User ID is required"));
      }

      try {
        const updatedLog = await NotificationLogModel.findOneAndUpdate(
          {
            _id: id,
            userId: userId,
          },
          {
            isRead: true,
            readAt: new Date(),
          },
          { new: true }
        );

        if (!updatedLog) {
          return next(
            new ApiError(404, "Notification log not found or unauthorized")
          );
        }

        await Promise.all([
          deleteCache(`${CACHE_PREFIX}:single:${id}`),
          deleteCachePattern(`${CACHE_PREFIX}:user:${userId}:*`),
          deleteCachePattern(`${CACHE_PREFIX}:active:*`),
        ]);

        return handleResponse(
          req,
          res,
          200,
          "Notification marked as read",
          updatedLog
        );
      } catch (error: any) {
        console.error("Mark as read error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  public static getUserStats = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      const { period = "7d" } = req.query;

      if (!userId || !mongoose.isValidObjectId(userId)) {
        return next(new ApiError(400, "Valid user ID is required"));
      }

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

      const cacheKey = `${CACHE_PREFIX}:stats:${userId}:${period}`;

      try {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          return handleResponse(
            req,
            res,
            200,
            "User notification stats fetched from cache",
            cachedData
          );
        }

        const pipeline: any[] = [
          {
            $match: {
              userId: userId,
              sentAt: { $gte: startDate, $lte: endDate },
            },
          },
          {
            $group: {
              _id: null,
              totalNotifications: { $sum: 1 },
              readNotifications: {
                $sum: { $cond: ["$isRead", 1, 0] },
              },
              unreadNotifications: {
                $sum: { $cond: ["$isRead", 0, 1] },
              },
              typeBreakdown: {
                $push: "$type",
              },
              latestNotification: { $max: "$sentAt" },
            },
          },
          {
            $addFields: {
              typeStats: {
                $arrayToObject: {
                  $map: {
                    input: {
                      $setUnion: ["$typeBreakdown"],
                    },
                    as: "type",
                    in: {
                      k: "$$type",
                      v: {
                        $size: {
                          $filter: {
                            input: "$typeBreakdown",
                            cond: { $eq: ["$$this", "$$type"] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ];

        const [stats] = await NotificationLogModel.aggregate(pipeline);

        const responseData = {
          period,
          dateRange: { startDate, endDate },
          userId,
          total: stats?.totalNotifications || 0,
          read: stats?.readNotifications || 0,
          unread: stats?.unreadNotifications || 0,
          latestNotification: stats?.latestNotification || null,
          typeBreakdown: stats?.typeStats || {},
          generatedAt: new Date(),
        };

        await setCache(cacheKey, responseData, 600); // Cache for 10 minutes

        return handleResponse(
          req,
          res,
          200,
          "User notification statistics fetched successfully",
          responseData
        );
      } catch (error: any) {
        console.error("Get user stats error:", error);
        return next(new ApiError(500, "Internal Server Error"));
      }
    }
  );

  public static receiveNotification = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id;

      if (!userId || !mongoose.isValidObjectId(userId)) {
        return next(new ApiError(400, 'Valid user ID is required'));
      }

      try {
        // Backend automatically detects notifications sent to this user
        // Find all notifications that were sent to this user but not yet acknowledged as received
        const recentNotifications = await NotificationLogModel.find({
          userId: userId,
          status: 'SENT',
           sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        })
        .sort({ sentAt: -1 })
        .limit(50)
        .select('_id type title body relatedEntityId relatedEntityType payload sentAt isRead')
        .lean();

        // Optionally mark them as delivered/received
        if (recentNotifications.length > 0) {
          const notificationIds = recentNotifications.map((n: any) => n._id);
          
          // Update to mark as received (you can add a 'receivedAt' field if needed)
          await NotificationLogModel.updateMany(
            { _id: { $in: notificationIds } },
            { 
              $set: { 
                'payload.receivedAt': new Date(),
                'payload.receivedFromBackend': true
              } 
            }
          );
        }

        const responseData = {
          total: recentNotifications.length,
          notifications: recentNotifications,
          message: 'Automatically detected notifications sent to user'
        };

        return handleResponse(
          req, 
          res, 
          200, 
          `Found ${recentNotifications.length} notifications sent to user`, 
          responseData
        );

      } catch (error: any) {
        console.error("Receive notification error:", error);
        return next(new ApiError(500, error.message || "Internal Server Error"));
      }
    }
  );

  public static getReceivedNotifications = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id;
      const { 
        page = 1, 
        limit = 20, 
        type,
        isRead,
        sortBy = 'sentAt',
        order = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(100, parseInt(limit as string) || 20);
      const skip = (pageNum - 1) * limitNum;

      try {
        const NotificationService = (await import('@middlewares/LogMedillewares/notificationLogger')).default;

        const query: any = { userId };
        if (type) query.type = type;
        if (isRead !== undefined) query.isRead = isRead === 'true';

        const sortOrder = order === 'desc' ? -1 : 1;
        const sortObj = { [sortBy as string]: sortOrder };

        const [notifications, total] = await Promise.all([
          NotificationService.getNotificationsByUserId(userId, query, sortObj, skip, limitNum),
          NotificationService.countNotificationsByUserId(userId, query)
        ]);

        const responseData = {
          notifications,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPrevPage: pageNum > 1,
          },
          filters: { type, isRead }
        };

        return handleResponse(
          req, 
          res, 
          200, 
          'Notifications fetched successfully', 
          responseData
        );

      } catch (error: any) {
        console.error("Get received notifications error:", error);
        return next(new ApiError(500, error.message || "Internal Server Error"));
      }
    }
  );
}
