import {Router} from "express";
import {
    signup,
    login,
    forgotPassword,
    verifyOtp,
    ResetPassword,
    googleAuthLogin,
    getUserProfile,
    updateUserProfile
} from "../Services/user.Service";
import { userMiddleware } from '../Middlewares/user.Middleware'
import upload from '../config/multer';

const userRouter = Router();

userRouter.get('/verify-token',userMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
userRouter.post('/signup', upload.single('profileImage'), signup);
userRouter.post('/login',login);
userRouter.post('/forgot-password',forgotPassword);
userRouter.post('/verify-otp',userMiddleware,verifyOtp);
userRouter.post('/reset-password',userMiddleware,ResetPassword);
userRouter.post('/google-login',googleAuthLogin);
userRouter.get('/get-profile',userMiddleware,getUserProfile);
userRouter.put('/update/profile', userMiddleware, upload.single('profileImage'), updateUserProfile);

export default userRouter;
