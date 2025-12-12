/*
┌───────────────────────────────────────────────────────────────────────┐
│  Response Handler - Standardized API response formatter.              │
└───────────────────────────────────────────────────────────────────────┘
*/
export const handleResponse = (req, res, statusCode, message, data) => {
    const response = {
        success: statusCode >= 200 && statusCode < 300,
        message,
        data,
    };
    return res.status(statusCode).json(response);
};
