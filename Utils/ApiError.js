/*
┌───────────────────────────────────────────────────────────────────────┐
│  API Error - Custom error class for API responses.                    │
└───────────────────────────────────────────────────────────────────────┘
*/
export class ApiError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, ApiError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}
