/*
┌───────────────────────────────────────────────────────────────────────┐
│  Unit Service - Business logic for Parent and Child Units.            │
│  Handles creation, retrieval, updates, and deletion of units.         │
└───────────────────────────────────────────────────────────────────────┘
*/
import parentUnitModel from '../Databases/Models/parentUnit.model';
import childUnit from '../Databases/Models/childUnit.model';
import { ApiError } from '../Utils/ApiError';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import { handleResponse } from '../Utils/handleResponse';
import { redis } from '../config/redis';
class ParentUnitServices {
    // Create a new Parent Unit
    static createParentUnit = catchAsyncErrors(async (req, res, next) => {
        const parentUnitData = req.body;
        const checktExistingUnit = await parentUnitModel.findOne({
            $or: [
                { code: parentUnitData.code },
                { name: parentUnitData.name }
            ]
        });
        if (checktExistingUnit) {
            return next(new ApiError(400, 'Parent Unit with this code already exists'));
        }
        const newParentUnit = await parentUnitModel.create({
            ...parentUnitData,
            createdBy: req.user?._id, //
            createdAt: new Date()
        });
        if (!newParentUnit) {
            return next(new ApiError(500, 'Failed to create Parent Unit'));
        }
        return handleResponse(req, res, 201, 'Parent Unit created successfully', newParentUnit);
    });
    // Get all Parent Units
    static getAllParentUnits = catchAsyncErrors(async (req, res, next) => {
        const search = req.query.search?.trim();
        const cacheKey = search ? `parentUnits_search_${search}` : 'parentUnits_all';
        const cacheData = await redis.get(cacheKey);
        if (cacheData) {
            const parentUnits = JSON.parse(cacheData);
            return handleResponse(req, res, 200, 'Parent Units fetched successfully from cache', parentUnits);
        }
        const parentFilter = {};
        if (search) {
            parentFilter.name = { $regex: search, $options: 'i' };
        }
        const parentUnits = await parentUnitModel
            .find(parentFilter)
            .limit(10)
            .select("_id name code")
            .lean();
        if (parentUnits.length === 0) {
            return next(new ApiError(404, 'No Parent Units found'));
        }
        await redis.set(cacheKey, JSON.stringify(parentUnits), { 'EX': 300 });
        return handleResponse(req, res, 200, 'Parent Units fetched successfully', parentUnits);
    });
    static updateParentUnit = catchAsyncErrors(async (req, res, next) => {
        const parentUnitId = req.params.id;
        const updateData = req.body;
        const updatedParentUnit = await parentUnitModel.findByIdAndUpdate(parentUnitId, { ...updateData, updatedBy: req.user?._id, updatedAt: new Date() }, { new: true });
        if (!updatedParentUnit) {
            return next(new ApiError(404, 'Parent Unit not found'));
        }
        return handleResponse(req, res, 200, 'Parent Unit updated successfully', updatedParentUnit);
    });
    // Delete Parent Unit
    // commented the deleted the parent unit from multiple ids
    static deleteParentUnit = catchAsyncErrors(async (req, res, next) => {
        const parentUnitId = req.params.id;
        if (!parentUnitId) {
            return next(new ApiError(400, 'Correct Parent Unit ID is required'));
        }
        const deleteParentUnitId = await parentUnitModel.findByIdAndDelete(parentUnitId);
        if (!deleteParentUnitId) {
            return next(new ApiError(404, 'Parent Unit not found'));
        }
        // await childUnit.deleteMany({ parentUnit: parentUnitId });
        return handleResponse(req, res, 200, 'Parent Unit and its associated Child Units deleted successfully');
    });
}
class ChildUnitServices {
    static createChildUnit = catchAsyncErrors(async (req, res, next) => {
        const childUnitData = req.body;
        const checkExistingUnit = await childUnit.findOne({
            $or: [
                { code: childUnitData.code },
                { name: childUnitData.name }
            ]
        });
        if (checkExistingUnit) {
            return next(new ApiError(400, 'Child Unit with this code already exists'));
        }
        const newChildUnit = await childUnit.create({
            ...childUnitData,
            createdBy: req.user?._id,
            createdAt: new Date()
        });
        if (!newChildUnit) {
            return next(new ApiError(500, 'Failed to create Child Unit'));
        }
        return handleResponse(req, res, 201, 'Child Unit created successfully', newChildUnit);
    });
    static getAllChildUnits = catchAsyncErrors(async (req, res, next) => {
        const search = req.query.search?.trim();
        const cacheKey = search ? `childUnits_search_${search}` : 'childUnits_all';
        const cacheData = await redis.get(cacheKey);
        if (cacheData) {
            const childUnits = JSON.parse(cacheData);
            return handleResponse(req, res, 200, 'Child Units fetched successfully from cache', childUnits);
        }
        const childFilter = {};
        if (search) {
            childFilter.name = { $regex: search, $options: 'i' };
        }
        const childUnits = await childUnit
            .find(childFilter)
            .limit(10)
            .select("_id name code parentUnit")
            .populate('name code')
            .lean();
        if (childUnits.length === 0) {
            return next(new ApiError(404, 'No Child Units found'));
        }
        return handleResponse(req, res, 200, 'Child Units fetched successfully', childUnits);
    });
    static updateChildUnit = catchAsyncErrors(async (req, res, next) => {
        const childUnitId = req.params.id;
        const updateData = req.body;
        const updatedChildUnit = await childUnit.findByIdAndUpdate(childUnitId, { ...updateData, updatedBy: req.user?._id, updatedAt: new Date() }, { new: true });
        if (!updatedChildUnit) {
            return next(new ApiError(404, 'Child Unit not found'));
        }
        return handleResponse(req, res, 200, 'Child Unit updated successfully', updatedChildUnit);
    });
    static deleteChildUnit = catchAsyncErrors(async (req, res, next) => {
        const childUnitId = req.params.id;
        const deletedChildUnit = await childUnit.findByIdAndDelete(childUnitId);
        if (!deletedChildUnit) {
            return next(new ApiError(404, 'Child Unit not found'));
        }
        return handleResponse(req, res, 200, 'Child Unit deleted successfully');
    });
}
export default { ParentUnitServices, ChildUnitServices };
