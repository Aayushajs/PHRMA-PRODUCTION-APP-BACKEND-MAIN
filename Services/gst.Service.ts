import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { gstModel } from "../Databases/Models/gst.Model";
import { Igst } from "../Databases/Entities/gst.interface";
import { Iuser } from "../Databases/Entities/user.Interface";

// Extend Request with user object
declare global {
    namespace Express {
        interface Request {
            user?: Iuser;
        }
    }
}

export default class GSTServices {
    public static createGST = catchAsyncErrors(
        async (req: Request, res: Response, next: NextFunction) => {
            const {
                gstName,
                gstRate,
                gstDescription,
                cgstRate,
                sgstRate,
                igstRate,
                isActive,
                applicableFrom,
                applicableTo,
            } = req.body;

            const fields = { gstName, gstRate };
            const missingFields = (Object.keys(fields) as Array<keyof typeof fields>)
                .filter((key) => fields[key] === undefined || fields[key] === null);

            if (missingFields.length > 0) {
                const message =
                    missingFields.length === 1
                        ? `${missingFields[0]} is required`
                        : `${missingFields.join(", ")} are required`;
                return next(new ApiError(400, message));
            }

            const existingGST = await gstModel.findOne({
                $or: [{ gstName: gstName.trim() }, { gstRate }],
            });

            if (existingGST) {
                return next(
                    new ApiError(409, "GST with same name or rate already exists")
                );
            }

            const newGSTData: Partial<Igst> = {
                gstName: gstName.trim(),
                gstRate : gstRate ?? 0,
                gstDescription: gstDescription?.trim(),
                cgstRate,
                sgstRate,
                igstRate,
                isActive: isActive ?? true,
                applicableFrom,
                applicableTo,
                createdBy: req.user?._id,
                updatedBy: req.user?._id,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const newGST = await gstModel.create(newGSTData);

            if (!newGST) {
                return next(new ApiError(500, "Failed to create GST record"));
            }

            return handleResponse(
                req,
                res,
                201,
                "GST created successfully",
                newGST
            );
        }
    );

    public static getAllGSTs = catchAsyncErrors(

        async (req: Request, res: Response, next: NextFunction) => {

            const gstRecords = await gstModel.find();

            if (gstRecords.length === 0) {
                return next(new ApiError(404, "No GST records found"));
            }
            return handleResponse(
                req,
                res,
                200,
                "GST records retrieved successfully",
                gstRecords
            );
        }
    );

    public static updateGST = catchAsyncErrors(
        async (
            req: Request, res: Response, next: NextFunction
        ) => {
            const gstId = req.params.gstId;
            const updateData = req.body;

            const existingGST = await gstModel.findById(gstId);
            console.log(existingGST);
            if (!existingGST) {
                return next(new ApiError(404, "GST record not found"));
            }

            const updateGSTData = await gstModel.findByIdAndUpdate(
                gstId,
                { ...updateData, updatedBy: req.user?._id, updatedAt: new Date() },
                { new: true }
            );
            if (!updateGSTData) {
                return next(new ApiError(500, "Failed to update GST record"));
            }
            return handleResponse(
                req,
                res,
                200,
                "GST record updated successfully",
                updateGSTData
            );
        }
    );


    public static deleteGST = catchAsyncErrors(
        async (
            req: Request, res: Response, next: NextFunction
        ) => {
            const gstId = req.params.gstId;
            const existingGST = await gstModel.findById(gstId);

            if (!existingGST) {
                return next(new ApiError(404, "GST record not found"));
            }

            await gstModel.findByIdAndDelete(gstId);

            const updateItems = await gstModel.updateMany(
                { itemGST: gstId },
                { $unset: { gstId: "" } }
            );

            console.log(`Cleaned up ${updateItems.modifiedCount} item(s) that referenced deleted GST.`);

            return handleResponse(
                req,
                res,
                200,
                "GST record deleted successfully",
                null
            );
        }
    );
}
