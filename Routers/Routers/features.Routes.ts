/*
┌───────────────────────────────────────────────────────────────────────┐
│  Public Features Route - Frontend API for feature flag access.        │
│  Returns only enabled features for the authenticated user.            │
│  Response format: { "FEATURE_KEY": true/false, ... }                  │
│  ────────────────────────────────────────────────────────────────────  │
│  ROLE-BASED FILTERING:                                                 │
│  - Backend checks user role against allowedRoles in feature flags     │
│  - If flag.allowedRoles contains user's role → feature enabled        │
│  - If user role not in allowedRoles → feature disabled                │
│  - Works for ADMIN, CUSTOMER, and any other roles                     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import FeatureFlagService from "../../Services/featureFlag.Service";
import { authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";

const featuresRouter = Router();
featuresRouter.get(
    "/",
    authenticatedUserMiddleware,
    FeatureFlagService.getUserFeatures
);

export default featuresRouter;
