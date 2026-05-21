/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Routes - API endpoints for category operations.             │
│  Routes for creating, updating, deleting, and retrieving categories.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import express from "express";
import CategoryService, { CategoryLogService } from "../../Services/category.Service";
import uploadImage from "../../config/multer";
import { adminMiddleware, authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { CATEGORY_CONSTANTS } from "../../types/Category";
import { validateRequest } from "../../Middlewares/validateRequest";
import {
  createCategorySchema,
  updateCategoryBodySchema,
  updateCategoryParamsSchema,
  getCategoryByIdParamsSchema,
  deleteCategoryParamsSchema,
  deleteCategoryQuerySchema,
  bulkToggleActiveSchema,
  recentlyViewedParamsSchema,
  listCategoriesQuerySchema,
  categoryLogIdParamsSchema,
  categoryLogsQuerySchema,
} from "../../Utils/lib/validators/category.Validator";


const router = express.Router();
const r = router;

r.post(
  "/create",
  adminMiddleware,
  uploadImage.fields([
    { name: "imageUrl", maxCount: CATEGORY_CONSTANTS.MAX_IMAGES },
    { name: "bannerUrl", maxCount: CATEGORY_CONSTANTS.MAX_BANNERS },
  ]),
  validateRequest({ body: createCategorySchema }),
  CategoryService.createCategory
);
r.get("/", validateRequest({ query: listCategoriesQuerySchema }), CategoryService.getAllCategory);

r.get("/list", validateRequest({ query: listCategoriesQuerySchema }), CategoryService.getCategoriesSimple);

r.get("/logs/debug", CategoryLogService.getDebugInfo);
r.get("/logs", validateRequest({ query: categoryLogsQuerySchema }), CategoryLogService.getAllLogs);
r.get("/logs/stats", validateRequest({ query: categoryLogsQuerySchema }), CategoryLogService.getLogStats);
r.get("/logs/date-range", validateRequest({ query: categoryLogsQuerySchema }), CategoryLogService.getLogsByDateRange);
r.get("/logs/:id", validateRequest({ params: categoryLogIdParamsSchema }), CategoryLogService.getLogById);

r.get("/RecentlyViewed",authenticatedUserMiddleware, CategoryService.getRecentlyViewedCategories);
r.get("/:id", validateRequest({ params: getCategoryByIdParamsSchema }), CategoryService.getCategoryById);

r.put(
  "/:id",
  adminMiddleware,
  uploadImage.fields([
    { name: "imageUrl", maxCount: CATEGORY_CONSTANTS.MAX_IMAGES },
    { name: "bannerUrl", maxCount: CATEGORY_CONSTANTS.MAX_BANNERS },
  ]),
  validateRequest({ params: updateCategoryParamsSchema, body: updateCategoryBodySchema }),
  CategoryService.updateCategory
);

r.post("/recently-viewed/:categoryId", authenticatedUserMiddleware, validateRequest({ params: recentlyViewedParamsSchema }), CategoryService.addToRecentlyViewedCategories);

r.delete("/:id", adminMiddleware, validateRequest({ params: deleteCategoryParamsSchema, query: deleteCategoryQuerySchema }), CategoryService.ActiovationCategory);

r.patch(
  "/bulk/toggle-active", adminMiddleware, validateRequest({ body: bulkToggleActiveSchema }), CategoryService.bulkToggleActive
);


export default router;
