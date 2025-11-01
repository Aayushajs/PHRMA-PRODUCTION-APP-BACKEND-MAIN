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
} from "../../Services/user.Service";
import { customersMiddleware } from '../../Middlewares/CheckLoginMiddleware'
import  uploadImage  from "../../config/multer";

const userRouter = Router();

userRouter.get('/verify-token',customersMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Token is valid",
        user: req.user
    });
});
userRouter.post('/signup', uploadImage.single('profileImage'), signup);
userRouter.post('/login',login);
userRouter.post('/forgot-password',forgotPassword);
userRouter.post('/verify-otp',customersMiddleware,verifyOtp);
userRouter.post('/reset-password',customersMiddleware,ResetPassword);
userRouter.post('/google-login',googleAuthLogin);
userRouter.get('/get-profile',customersMiddleware,getUserProfile);
userRouter.put('/update/profile', customersMiddleware, uploadImage.single('profileImage'), updateUserProfile);

export default userRouter;
