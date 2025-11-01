import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Utils/ApiError";
import userModel from "../Databases/Models/user.Models";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import RoleIndex from "../Utils/Roles.enum";
import dotenv from "dotenv";
dotenv.config({ path: "./config/.env" });

// CUSTOMER ONLY MIDDLEWARE (Original)
export const customersMiddleware = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const headerToken = req.headers.authorization?.split(" ")[1];
    console.log("Token from header : ", headerToken);

    const token = req.cookies.userToken || headerToken;
    console.log("Token from cookies or header : ", token);

    if (!token) {
      console.log("No token provided[TOKEN] : ", token);
      return next(new ApiError(401, "Unauthorized: No token provided"));
    }

    const decoded = jwt.verify(
      token,
      process.env.USER_SECRET_KEY as string
    ) as { _id: string };

    const user = await userModel.findById(decoded._id);

    if (!user) {
      return next(new ApiError(401, "Unauthorized: Invalid token"));
    }

    req.user = user;

    next();
  }
);

// ADMIN ONLY MIDDLEWARE
export const adminMiddleware = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const headerToken = req.headers.authorization?.split(" ")[1];
    const token = req.cookies.userToken || headerToken;

    if (!token) {
      return next(new ApiError(401, "Unauthorized: No token provided"));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.USER_SECRET_KEY as string
      ) as { _id: string };

      const user = await userModel.findById(decoded._id);

      if (!user) {
        return next(new ApiError(401, "Unauthorized: Invalid token"));
      }

      if (user.role !== RoleIndex.ADMIN) {
        return next(new ApiError(403, "Forbidden: Admin access required"));
      }

      req.user = user;
      next();
    } catch (error) {
      return next(new ApiError(401, "Unauthorized: Invalid token"));
    }
  }
);

// USER MIDDLEWARE (CUSTOMER + ADMIN)
export const userMiddleware = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const headerToken = req.headers.authorization?.split(" ")[1];
    const token = req.cookies.userToken || headerToken;

    if (!token) {
      return next(new ApiError(401, "Unauthorized: No token provided"));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.USER_SECRET_KEY as string
      ) as { _id: string };

      const user = await userModel.findById(decoded._id);

      if (!user) {
        return next(new ApiError(401, "Unauthorized: Invalid token"));
      }

      const allowedRoles = [RoleIndex.CUSTOMER, RoleIndex.ADMIN];
      if (!allowedRoles.includes(user.role)) {
        return next(new ApiError(403, "Forbidden: Access denied"));
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("User middleware error:", error);
      return next(new ApiError(401, "Unauthorized: Invalid token"));
    }
  }
);

// AUTHENTICATED USER MIDDLEWARE (ANY ROLE INCLUDING UNKNOWN)
export const authenticatedUserMiddleware = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {

    const headerToken = req.headers.authorization?.split(" ")[1];
    const token = req.cookies.userToken || headerToken;

    if (!token) {
      return next(new ApiError(401, "Unauthorized: No token provided"));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.USER_SECRET_KEY as string
      ) as { _id: string };

      const user = await userModel.findById(decoded._id);

      if (!user) {
        return next(new ApiError(401, "Unauthorized: Invalid token"));
      }

      req.user = user;
      next();
    } catch (error) {
      return next(new ApiError(401, "Unauthorized: Invalid token"));
    }
  }
);
