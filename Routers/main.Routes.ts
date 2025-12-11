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
import notificationLogRouter from './Routers/notificationLog.Routes';
const mainRouter = Router();

mainRouter.use('/users', userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
mainRouter.use('/items', itemsRouter);
mainRouter.use('/advertisements', advertisementRouter);
mainRouter.use('/units', units);
mainRouter.use('/gsts', gstRouter);
mainRouter.use('/notifications', notificationLogRouter);

export default mainRouter;