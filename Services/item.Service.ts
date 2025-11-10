import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { handleResponse } from "../Utils/handleResponse";
import { redis } from "../config/redis";
import ItemModel from "../Databases/Models/item.Model"
import { Iuser } from "../Databases/Entities/user.Interface";
import ChildUnitModel from "../Databases/Models/childUnit.model";
import ParentUnitModel from "../Databases/Models/parentUnit.model";


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



            const newItemData: any = {
                itemName,
                itemPrice,
                itemDescription,
                itemCategory,
                itemMfgDate,
                itemParentUnit: finalParentUnit,
                itemChildUnit,
                itemExpiryDate,
                createdBy: req.user?._id,
                createAt: Date.now()
            }

            const newItem: any = await ItemModel.create(newItemData);

            handleResponse(req, res, 201, "Item created successfully", newItem);
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

            // console.log("Item ID:", itemId);
            // console.log("Update Data:", updateData);    

            const updatedItem: any = await ItemModel.findByIdAndUpdate(
                itemId,
                {
                    ...updateData,
                    updatedBy: req.user?._id,
                },
                { new: true }
            );
            if (!updatedItem) {
                return next(
                    new ApiError(404, "Item not found")
                );
            }

            handleResponse(req, res, 200, "Item updated successfully", updatedItem);
        }
    )

    public static deleteItem = catchAsyncErrors(
        async (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            const itemId = req.params.id;

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
                return handleResponse(req, res, 200, "Items retrieved successfully", JSON.parse(cachedItems))   ;
            }

            const items: any = await ItemModel.find()
                .skip((page - 1) * limit)
                .limit(limit);

            console.log("total items : ",items.length);

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
}

