import { Response, Request, NextFunction } from 'express';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import { ApiError } from '../Utils/ApiError'
import UserModel from '../Databases/Models/user.Models';
import bcrypt from 'bcryptjs';
import { handleResponse } from '../Utils/handleResponse';
import { generateUserToken } from '../Utils/jwtToken';
import { generateOtp } from '../Utils/OtpGenerator';
import {redis} from '../config/redis';
import { sendEmail } from '../Utils/mailer';


export const signup = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, address, phone } = req.body;

    if (!name || !email || !password || !address || !phone) {
        return next(new ApiError(400, "All fields are required"));
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
        return next(new ApiError(400, "User already exists"));
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await UserModel.create({
        name,
        email,
        password: hashedPassword,
        address,
        phone
    })
    console.log("User created successfully : ", user);

    return handleResponse(req, res, 201, "User Created Successfully", user);
})

export const login = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new ApiError(400, "All fields are required"));
    }

    const userExist = await UserModel.findOne({ email }).select('name email password phone').lean();
    console.log("User found : ", userExist);

    if (!userExist) {
        return next(new ApiError(400, "Invalid email or password"));
    }

    const isPasswordMatched = await bcrypt.compare(password, userExist.password);
    console.log("Password matched : ", isPasswordMatched);

    if (!isPasswordMatched) {
        return next(new ApiError(400, "Invalid email or password"));
    }
    console.log("Login Successful");


    const userToken = generateUserToken(userExist)

    res.cookie("userToken", userToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });


    return handleResponse(
        req,
        res,
        200,
        "Login Successful",
        { user: userExist, token: userToken }
    );
});

export const forgotPassword = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const {email} = req.body;

    if(!email){
        return next(new ApiError(400,"Email is required"));
    }

    const Existeduser = await UserModel.findOne({email});
    if(!Existeduser){
        return next(new ApiError(400,"User not found"));
    }

    const otp = generateOtp();
    console.log("Generated OTP : ",otp);

    await redis.set(`otp:${Existeduser._id}`, otp, {'EX': 180});

    if(email){
        console.log(`Sending OTP ${otp} to email ${email}`);
        await sendEmail(email, otp);
    }
    return handleResponse(req,res,200,"OTP sent to your email");
});


export const verifyOtp = catchAsyncErrors(async(req: Request, res: Response, next: NextFunction)=>{
    const userId = req.user?._id;
    const { EnteredOtp } = req.body;

    const otp = await redis.get(`otp:${userId}`);
    console.log("otp : ",otp);

    if(!otp){
        console.log("OTP not found");
        return next(new ApiError(400,"OTP expired"));
    }

    if(EnteredOtp !== otp){
        console.log("Invalid OTP");
        return next(new ApiError(400,"Invalid OTP"));
    }

    return handleResponse(req,res,200,"OTP verified");
})

export const ResetPassword = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction)=>{
    const {newPassword} = req.body;
    const userId = req.user?._id;

    if(!newPassword){
        return next(new ApiError(400,"New password is required"));
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newPassword, salt);


    const user = await UserModel.findByIdAndUpdate(userId,{
        password: newHashedPassword
    },{
        new: true,
        runValidators: true,
        useFindAndModify: false
    });
    console.log("User found : ",user);

    if(!user){
        return next(new ApiError(400,"User not found"));
    }

    return handleResponse(req,res,200,"Password reset successfully");
})


