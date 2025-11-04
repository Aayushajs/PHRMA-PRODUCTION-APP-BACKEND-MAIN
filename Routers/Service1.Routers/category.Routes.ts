import express from "express";
import CategoryService, { CategoryLogService } from "../../Services/category.Service";
import upload from "../../config/multer";
import { adminMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { CATEGORY_CONSTANTS } from "../../types/Category";

const router = express.Router();
const r = router;

r.post(
  "/create",
  adminMiddleware,
  upload.fields([
    { name: "imageUrl", maxCount: CATEGORY_CONSTANTS.MAX_IMAGES },
    { name: "bannerUrl", maxCount: CATEGORY_CONSTANTS.MAX_BANNERS },
  ]),
  CategoryService.createCategory
);
r.get("/", CategoryService.getAllCategory);

r.get("/list", CategoryService.getCategoriesSimple);

r.get("/logs/debug", CategoryLogService.getDebugInfo);
r.get("/logs", CategoryLogService.getAllLogs);
r.get("/logs/stats", CategoryLogService.getLogStats);
r.get("/logs/date-range", CategoryLogService.getLogsByDateRange);
r.get("/logs/:id", CategoryLogService.getLogById);

r.get("/:id", CategoryService.getCategoryById);

r.put(
  "/:id",
  adminMiddleware,
  upload.fields([
    { name: "imageUrl", maxCount: CATEGORY_CONSTANTS.MAX_IMAGES },
    { name: "bannerUrl", maxCount: CATEGORY_CONSTANTS.MAX_BANNERS },
  ]),
  CategoryService.updateCategory
);

r.delete("/:id", adminMiddleware, CategoryService.ActiovationCategory);

r.patch(
  "/bulk/toggle-active",adminMiddleware, CategoryService.bulkToggleActive
);

export default router;
