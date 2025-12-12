/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Routes - API endpoints for user authentication and profiles.    │
│  Routes for signup, login, OTP verification, and profile updates.     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import UserService from "../../Services/user.Service";
import { customersMiddleware } from '../../Middlewares/CheckLoginMiddleware'
import uploadImage from "../../config/multer";

const userRouter = Router();
const r = userRouter

r.get('/verify-token', customersMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
r.post('/signup', uploadImage.single('profileImage'), UserService.signup);
r.post('/login', UserService.login);
r.post('/forgot-password', UserService.forgotPassword);
r.post('/verify-otp', UserService.verifyOtp);
r.post('/reset-password', customersMiddleware, UserService.ResetPassword);
r.post('/google-login', UserService.googleAuthLogin);
r.get('/profile', customersMiddleware, UserService.getUserProfile);
r.put('/update/profile', customersMiddleware, uploadImage.single('profileImage'), UserService.updateUserProfile);

export default userRouter;
