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
} from "../Services/user.Services";
import { userMiddleware } from '../Middlewares/user.Middleware'

const userRouter = Router();

userRouter.get('/verify-token',userMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
userRouter.post('/signup',signup);
userRouter.post('/login',login);
userRouter.post('/forgot-password',forgotPassword);
userRouter.post('/verify-otp',userMiddleware,verifyOtp);
userRouter.post('/reset-password',userMiddleware,ResetPassword);
userRouter.post('/google-login',googleAuthLogin);
userRouter.get('/profile',userMiddleware,getUserProfile);
userRouter.put('/update/profile',userMiddleware,updateUserProfile);




export default userRouter;
