/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Routes - API endpoints for featured items.         │
│  Routes for managing featured medicines and viewing logs.             │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import FeaturedMedicineService, { FeaturedMedicineLogService } from "../../Services/featured.Service";
import {uploadImage} from "../../config/multer";
import { adminMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { validateRequest } from "../../Middlewares/validateRequest";
import {
  createFeaturedSchema,
  updateFeaturedBodySchema,
  featuredIdParamsSchema,
  featuredListQuerySchema,
  featuredLogIdParamsSchema,
} from "../../Utils/lib/validators/featured.Validator";

const featuredRouter = Router();
const r = featuredRouter;


r.post("/create", adminMiddleware, uploadImage.single("imageUrl"),
  validateRequest({ body: createFeaturedSchema }),
  FeaturedMedicineService.createFeaturedMedicine
);

r.get("/", validateRequest({ query: featuredListQuerySchema }), FeaturedMedicineService.getFeaturedMedicines);

r.put("/:id", adminMiddleware, uploadImage.single("imageUrl"),
  validateRequest({ params: featuredIdParamsSchema, body: updateFeaturedBodySchema }),
  FeaturedMedicineService.updateFeaturedMedicine
);

r.delete("/:id", adminMiddleware,
  validateRequest({ params: featuredIdParamsSchema }),
  FeaturedMedicineService.deleteFeaturedMedicine
);

// LOG ROUTES
r.get("/logs", adminMiddleware, validateRequest({ query: featuredListQuerySchema }), FeaturedMedicineLogService.getAllLogs);
r.get("/logs/stats", adminMiddleware, validateRequest({ query: featuredListQuerySchema }), FeaturedMedicineLogService.getLogStats);
r.get("/logs/date-range", adminMiddleware, validateRequest({ query: featuredListQuerySchema }), FeaturedMedicineLogService.getLogsByDateRange);
r.get("/logs/:id", adminMiddleware, validateRequest({ params: featuredLogIdParamsSchema }), FeaturedMedicineLogService.getLogById);

export default featuredRouter;
