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
import { validateRequest } from "../../Middlewares/validateRequest";
import {
    createAdSchema,
    updateAdBodySchema,
    adIdParamsSchema,
    adLogIdParamsSchema,
    adLogByAdvertisementParamsSchema,
    adListingQuerySchema,
} from "../../Validators/advertisement.Validator";

const router = express.Router();
const r = router;

r.get("/debug", AdvertisementService.getDebugInfo);
r.post("/create", adminMiddleware, uploadImage.single("imageUrl"), validateRequest({ body: createAdSchema }), AdvertisementService.createAd);
r.put("/update/:adId", adminMiddleware, uploadImage.single("imageUrl"), validateRequest({ params: adIdParamsSchema, body: updateAdBodySchema }), AdvertisementService.updateAd);
r.delete("/delete/:adId", adminMiddleware, validateRequest({ params: adIdParamsSchema }), AdvertisementService.deleteAd);
r.patch("/deactivate/:adId", adminMiddleware, validateRequest({ params: adIdParamsSchema }), AdvertisementService.softDeleteAd);
r.get("/currently-running", AdvertisementService.getCurrentlyRunningAds);
r.get("/active", AdvertisementService.getActiveAds);
r.post("/track-click/:adId", userMiddleware, validateRequest({ params: adIdParamsSchema }), AdvertisementService.trackClick);
r.get("/analytics", adminMiddleware, validateRequest({ query: adListingQuerySchema }), AdvertisementService.getAnalytics);

// Advertisement Log Routes
r.get("/logs", adminMiddleware, validateRequest({ query: adListingQuerySchema }), AdvertisementLogService.getAllLogs);
r.get("/logs/stats", adminMiddleware, validateRequest({ query: adListingQuerySchema }), AdvertisementLogService.getLogStats);
r.get("/logs/date-range", adminMiddleware, validateRequest({ query: adListingQuerySchema }), AdvertisementLogService.getLogsByDateRange);
r.get("/logs/:id", adminMiddleware, validateRequest({ params: adLogIdParamsSchema }), AdvertisementLogService.getLogById);
r.get("/logs/advertisement/:advertisementId", adminMiddleware, validateRequest({ params: adLogByAdvertisementParamsSchema, query: adListingQuerySchema }), AdvertisementLogService.getLogsByAdvertisement);

export default router;
