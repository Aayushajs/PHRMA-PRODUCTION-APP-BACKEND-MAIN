/*
┌───────────────────────────────────────────────────────────────────────┐
│  Error Handler Middleware - Global error handling for Express apps.   │
│  Captures errors, formats responses, and logs stack traces.           │
└───────────────────────────────────────────────────────────────────────┘
*/
export const errorHandler = (err, req, res, next) => {
    console.log(err.stack);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    return res.status(statusCode).json({
        success: false,
        statusCode,
        message
    });
};
