import { Request, Response, NextFunction } from "express";
import FeaturedMedicine from "../Databases/Models/featuredMedicine.Model";
import { getCache, setCache, deleteCache } from "../Utils/cache"; // using your reusable cache utils
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import crypto from "crypto";
import mongoose from "mongoose";

const CACHE_KEY = "featuredMedicines";
const CACHE_TTL = 3000;

//CREATE-----------------------------------------------------------------
export const createFeaturedMedicine = catchAsyncErrors(
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
          req.file.buffer,
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

    await deleteCache(CACHE_KEY);

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
export const getFeaturedMedicines = catchAsyncErrors(
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
        { $unwind: "$categoryDetails" },
        {
          $addFields: {
            categoryName: "$categoryDetails.name",
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
            category: "$categoryName",
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
export const updateFeaturedMedicine = catchAsyncErrors(
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
          req.file.buffer,
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

    await deleteCache(CACHE_KEY);

    return handleResponse(
      req,
      res,
      200,
      "Medicine updated successfully",
      updatedMedicine
    );
  }
);
