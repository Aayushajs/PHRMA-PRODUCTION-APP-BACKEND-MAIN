/*
┌───────────────────────────────────────────────────────────────────────┐
│  FEATURE FLAG SYSTEM - EXAMPLE USAGE                                  │
│  This file demonstrates how to use the feature flag system in routes. │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import { requireFeature } from "../Middlewares/featureFlagMiddleware";
import { customersMiddleware, adminMiddleware } from "../Middlewares/CheckLoginMiddleware";
import { handleResponse } from "../Utils/handleResponse";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import FeatureFlagService from "../Services/featureFlag.Service";
import { Widget } from "../types/widget.types"

const exampleRouter = Router();

// ============================================================
// EXAMPLE 1: Protected Route Using Feature Flag
// ============================================================

/**
 * Example: Featured Medicines List
 * Only accessible if "FEATURED_MEDICINES" flag is enabled for the user
 */
exampleRouter.get(
  "/featured-medicines",
  customersMiddleware,
  requireFeature("FEATURED_MEDICINES"), // ← Feature flag protection
  catchAsyncErrors(async (req, res) => {
    // This code only runs if feature is enabled for the user
    const featuredMedicines = [
      { id: 1, name: "Paracetamol", price: 50 },
      { id: 2, name: "Amoxicillin", price: 120 },
    ];
    
    handleResponse(req, res, 200, "Featured medicines retrieved", featuredMedicines);
  })
);

// ============================================================
// EXAMPLE 2: Multiple Feature Flags
// ============================================================

/**
 * Example: Payment Processing
 * Requires both authentication AND "ONLINE_PAYMENT" feature flag
 */
exampleRouter.post(
  "/process-payment",
  customersMiddleware,
  requireFeature("ONLINE_PAYMENT"), // ← Feature flag check
  catchAsyncErrors(async (req, res) => {
    const { amount, method } = req.body;
    
    // Process payment logic here
    handleResponse(req, res, 200, "Payment processed successfully", {
      transactionId: "TXN123456",
      amount,
      method,
    });
  })
);

// ============================================================
// EXAMPLE 3: AI Chatbot Feature
// ============================================================

/**
 * Example: AI Chatbot Endpoint
 * Only available if "AI_CHATBOT" feature is enabled
 */
exampleRouter.post(
  "/ai-chat",
  customersMiddleware,
  requireFeature("AI_CHATBOT"), // ← Feature flag
  catchAsyncErrors(async (req, res) => {
    const { message } = req.body;
    
    // Call AI service
    const aiResponse = {
      reply: "This is an AI-powered response",
      confidence: 0.95,
    };
    
    handleResponse(req, res, 200, "AI response generated", aiResponse);
  })
);

// ============================================================
// EXAMPLE 4: Conditional Logic in Controller
// ============================================================

/**
 * Example: Dashboard with Conditional Features
 * Check features programmatically in controller logic
 */
exampleRouter.get(
  "/dashboard",
  customersMiddleware,
  catchAsyncErrors(async (req, res) => {
    const userId = req.user?._id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check multiple features dynamically
    const hasOnlinePayment = await FeatureFlagService.isFeatureEnabled(
      "ONLINE_PAYMENT",
      userId,
      userRole as any
    );

    const hasFeaturedMedicines = await FeatureFlagService.isFeatureEnabled(
      "FEATURED_MEDICINES",
      userId,
      userRole as any
    );

    const hasAIChatbot = await FeatureFlagService.isFeatureEnabled(
      "AI_CHATBOT",
      userId,
      userRole as any
    );

    // Build dashboard response based on enabled features
    const dashboard = {
      user: {
        id: userId,
        role: userRole,
      },
      features: {
        onlinePayment: hasOnlinePayment,
        featuredMedicines: hasFeaturedMedicines,
        aiChatbot: hasAIChatbot,
      },
      widgets: [] as Widget[]
    };

    // Add widgets based on enabled features
    if (hasOnlinePayment) {
      dashboard.widgets.push({ type: "payment", title: "Quick Payment" });
    }

    if (hasFeaturedMedicines) {
      dashboard.widgets.push({ type: "featured", title: "Featured Products" });
    }

    if (hasAIChatbot) {
      dashboard.widgets.push({ type: "chatbot", title: "AI Assistant" });
    }

    handleResponse(req, res, 200, "Dashboard retrieved", dashboard);
  })
);

// ============================================================
// EXAMPLE 5: Admin-Only Feature with Flag
// ============================================================

/**
 * Example: Analytics Dashboard
 * Only for admins + requires "ADVANCED_ANALYTICS" feature
 */
exampleRouter.get(
  "/analytics",
  adminMiddleware,
  requireFeature("ADVANCED_ANALYTICS"),
  catchAsyncErrors(async (req, res) => {
    const analytics = {
      totalUsers: 1500,
      totalOrders: 5000,
      revenue: 250000,
    };
    
    handleResponse(req, res, 200, "Analytics retrieved", analytics);
  })
);

export default exampleRouter;
