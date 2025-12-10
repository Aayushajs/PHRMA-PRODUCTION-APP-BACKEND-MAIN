/*
┌───────────────────────────────────────────────────────────────────────┐
│  Response Handler - Standardized API response formatter.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response, Request } from 'express';

interface IResponse {
    success: boolean;
    message: string;
    data?: any;
}

export const handleResponse = (req: Request, res: Response, statusCode: number, message: string, data?: any) => {
    const response: IResponse = {
        success: statusCode >= 200 && statusCode < 300,
        message,
        data,
    };
    return res.status(statusCode).json(response);
};