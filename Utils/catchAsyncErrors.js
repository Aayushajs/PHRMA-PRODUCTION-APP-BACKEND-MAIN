/*
┌───────────────────────────────────────────────────────────────────────┐
│  Async Error Handler - Wrapper to catch async errors in routes.       │
└───────────────────────────────────────────────────────────────────────┘
*/
export const catchAsyncErrors = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
