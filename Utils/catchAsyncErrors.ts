/*
┌───────────────────────────────────────────────────────────────────────┐
│  Async Error Handler - Wrapper to catch async errors in routes.       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';

type AsynCFunction = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<any>;

export const catchAsyncErrors =
    (fn: AsynCFunction) => (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };