/*
┌───────────────────────────────────────────────────────────────────────┐
│  Error Handler Middleware - Global error handling for Express apps.   │
│  Captures errors, formats responses, and logs stack traces.           │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';


export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log(err.stack);

    const statusCode = (err as any).statusCode || 500;
    const message = err.message || 'Internal Server Error';

    return res.status(statusCode).json({
        success: false,
        statusCode,
        message
    });
}