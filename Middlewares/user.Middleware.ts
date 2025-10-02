import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../Utils/ApiError';
import userModel from '../Databases/Models/user.Models';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

export const userMiddleware = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {

    const headerToken = req.headers.authorization?.split(" ")[1];
    console.log("Token from header : ", headerToken);


    const token = req.cookies.userToken || headerToken;
    console.log("Token from cookies or header : ", token);

    if (!token) {
        console.log("No token provided[TOKEN] : ", token);
        return next(new ApiError(401, "Unauthorized: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.USER_SECRET_KEY as string) as { _id: string };
    console.log("Decoded Token : ", decoded);

    const user = await userModel.findById(decoded._id);
    console.log("User found via middleware: ", user);

    console.log("User from middleware : ", user);

    if (!user) {
        return next(new ApiError(401, "Unauthorized: Invalid token"));
    }

    req.user = user;
    console.log("User from middleware : ", req.user);
    next();
})