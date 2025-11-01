import express from "express";
import CategoryService from "../../Services/category.Service";
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

r.get("/list", CategoryService.getCategoriesSimple);

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

r.delete("/:id", adminMiddleware, CategoryService.deleteCategory);

r.patch(
  "/bulk/toggle-active",
  adminMiddleware,
  CategoryService.bulkToggleActive
);

export default router;
