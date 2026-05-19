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

const userRouter = Router();
const r = userRouter

r.get('/verify-token', userMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
r.post('/signup', uploadImage.single('profileImage'), UserService.signup);
r.post('/login', UserService.login);
// Refresh endpoint — no auth middleware; the refresh cookie/body IS the credential.
r.post('/refresh-token', UserService.refreshToken);
// Logout — userMiddleware so we can identify the caller, but the handler
// is idempotent even if no refresh token is presented.
r.post('/logout', userMiddleware, UserService.logout);
r.post('/forgot-password', UserService.forgotPassword);
r.post('/verify-otp', UserService.verifyOtp);
r.post('/reset-password', userMiddleware, UserService.ResetPassword);
r.post('/google-login', UserService.googleAuthLogin);
r.get('/profile', userMiddleware, UserService.getUserProfile);
r.put('/update/profile', userMiddleware, uploadImage.single('profileImage'), UserService.updateUserProfile);

export default userRouter;
