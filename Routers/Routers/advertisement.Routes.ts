/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Routes - API endpoints for advertisement operations.   │
│  Routes for managing ads, tracking clicks, and viewing analytics.     │
└───────────────────────────────────────────────────────────────────────┘
*/

import express from "express";
import AdvertisementService, { AdvertisementLogService } from "../../Services/advertisement.Service";
import { uploadImage } from "../../config/multer";
import { adminMiddleware, userMiddleware } from "../../Middlewares/CheckLoginMiddleware";

const router = express.Router();
const r = router;

r.get("/debug", AdvertisementService.getDebugInfo);
r.post("/create", adminMiddleware, uploadImage.single("imageUrl"), AdvertisementService.createAd);
r.put("/update/:adId", adminMiddleware, uploadImage.single("imageUrl"), AdvertisementService.updateAd);
r.delete("/delete/:adId", adminMiddleware, AdvertisementService.deleteAd);
r.patch("/deactivate/:adId", adminMiddleware, AdvertisementService.softDeleteAd);
r.get("/currently-running", AdvertisementService.getCurrentlyRunningAds);
r.get("/active", AdvertisementService.getActiveAds);
r.post("/track-click/:adId", userMiddleware, AdvertisementService.trackClick);
r.get("/analytics", adminMiddleware, AdvertisementService.getAnalytics);

// Advertisement Log Routes
r.get("/logs", adminMiddleware, AdvertisementLogService.getAllLogs);
r.get("/logs/stats", adminMiddleware, AdvertisementLogService.getLogStats);
r.get("/logs/date-range", adminMiddleware, AdvertisementLogService.getLogsByDateRange);
r.get("/logs/:id", adminMiddleware, AdvertisementLogService.getLogById);
r.get("/logs/advertisement/:advertisementId", adminMiddleware, AdvertisementLogService.getLogsByAdvertisement);

export default router;