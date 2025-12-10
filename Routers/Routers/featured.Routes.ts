/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Routes - API endpoints for featured items.         │
│  Routes for managing featured medicines and viewing logs.             │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import FeaturedMedicineService, { FeaturedMedicineLogService } from "../../Services/featured.Service";
import upload from "../../config/multer";
import { adminMiddleware } from "../../Middlewares/CheckLoginMiddleware";

const featuredRouter = Router();
const r = featuredRouter;

r.post("/create", adminMiddleware, upload.single("imageUrl"),
  FeaturedMedicineService.createFeaturedMedicine
);

r.get("/", FeaturedMedicineService.getFeaturedMedicines);

r.put("/:id", adminMiddleware, upload.single("imageUrl"),
  FeaturedMedicineService.updateFeaturedMedicine
);

r.delete("/:id", adminMiddleware,
  FeaturedMedicineService.deleteFeaturedMedicine
);

// LOG ROUTES
r.get("/logs", adminMiddleware, FeaturedMedicineLogService.getAllLogs);
r.get("/logs/stats", adminMiddleware, FeaturedMedicineLogService.getLogStats);
r.get("/logs/date-range", adminMiddleware, FeaturedMedicineLogService.getLogsByDateRange);
r.get("/logs/:id", adminMiddleware, FeaturedMedicineLogService.getLogById);

export default featuredRouter;