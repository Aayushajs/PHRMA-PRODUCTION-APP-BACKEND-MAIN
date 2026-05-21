/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Routes - API endpoints for user authentication and profiles.    │
│  Routes for signup, login, OTP verification, and profile updates.     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import UserService from "../../Services/user.Service";
import { customersMiddleware, userMiddleware } from '../../Middlewares/CheckLoginMiddleware'
import uploadImage from "../../config/multer";
import { validateRequest } from "../../Middlewares/validateRequest";
import {
    signupSchema,
    loginSchema,
    googleLoginSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    resetPasswordSchema,
    refreshTokenSchema,
    logoutSchema,
    updateProfileSchema,
} from "../../Utils/lib/validators/user.Validator";

import { authLimiter } from "../../Middlewares/rateLimiter";

const userRouter = Router();
const r = userRouter

r.get('/verify-token', userMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
r.post('/signup', authLimiter, uploadImage.single('profileImage'), validateRequest({ body: signupSchema }), UserService.signup);
r.post('/login', authLimiter, validateRequest({ body: loginSchema }), UserService.login);
// Refresh endpoint — no auth middleware; the refresh cookie/body IS the credential.
r.post('/refresh-token', validateRequest({ body: refreshTokenSchema }), UserService.refreshToken);
// Logout — userMiddleware so we can identify the caller, but the handler
// is idempotent even if no refresh token is presented.
r.post('/logout', userMiddleware, validateRequest({ body: logoutSchema }), UserService.logout);
r.post('/forgot-password', authLimiter, validateRequest({ body: forgotPasswordSchema }), UserService.forgotPassword);
r.post('/verify-otp', authLimiter, validateRequest({ body: verifyOtpSchema }), UserService.verifyOtp);
r.post('/reset-password', userMiddleware, validateRequest({ body: resetPasswordSchema }), UserService.ResetPassword);
r.post('/google-login', authLimiter, validateRequest({ body: googleLoginSchema }), UserService.googleAuthLogin);
r.get('/profile', userMiddleware, UserService.getUserProfile);
r.put('/update/profile', userMiddleware, uploadImage.single('profileImage'), validateRequest({ body: updateProfileSchema }), UserService.updateUserProfile);

export default userRouter;
