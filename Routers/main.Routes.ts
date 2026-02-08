/*
┌───────────────────────────────────────────────────────────────────────┐
│  Main Router - Entry point for all API routes.                        │
│  Aggregates routes for Users, Medicines, Categories, Items, and Ads.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import userRouter from './Routers/user.Routes';
import featuredRouter from './Routers/featured.Routes';
import categoryRouter from './Routers/category.Routes';
import itemsRouter from './Routers/item.Routes';
import advertisementRouter from './Routers/advertisement.Routes';
import units from './Routers/unit.Routes';
import gstRouter from './Routers/gst.Routes';
import prescriptionRouter from './Routers/prescription.Routes';
import notification from "./Routers/notificationLog.Routes";
import featureFlagRouter from './Routers/featureFlag.Routes';
import featuresRouter from './Routers/features.Routes';
const mainRouter = Router();

// Health check endpoint to prevent cold starts
mainRouter.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Server is running'
  });
});

mainRouter.use('/users', userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
mainRouter.use('/items', itemsRouter);
mainRouter.use('/advertisements', advertisementRouter);
mainRouter.use('/units', units);
mainRouter.use('/gsts', gstRouter);
mainRouter.use('/prescriptions', prescriptionRouter);
mainRouter.use('/notifications',notification)

// Feature Flag System
mainRouter.use('/feature-flags', featureFlagRouter); // Admin CRUD
mainRouter.use('/features', featuresRouter);         // Public user features

export default mainRouter;