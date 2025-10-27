import { Response, Request, NextFunction } from 'express';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import { ApiError } from '../Utils/ApiError'
import UserModel from '../Databases/Models/user.Models';
import bcrypt from 'bcryptjs';
import { handleResponse } from '../Utils/handleResponse';
import { generateUserToken } from '../Utils/jwtToken';
import { generateOtp } from '../Utils/OtpGenerator';
import { redis } from '../config/redis';
import { sendEmail } from '../Utils/mailer';
import { OAuth2Client, TokenPayload } from 'google-auth-library';



export const signup = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, phone } = req.body;
    console.log("Request Body : ", req.body);


    if (!name || !email || !password|| !phone) {
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
        phone
    })
    console.log("User created successfully : ", user);

    return handleResponse(req, res, 201, "User Created Successfully", user);
})

export const login = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    console.log("Request Body : ", req.body);

    if (!email || !password) {
        return next(new ApiError(400, "All fields are required"));
    }

    const userExist = await UserModel.findOne({ email }).select('name email password phone').lean();
    console.log("User found : ", userExist);

    if (!userExist) {
        return next(new ApiError(400, "User Does not exist"));
    }

    const isPasswordMatched = await bcrypt.compare(password, userExist.password);
    console.log("Password matched : ", isPasswordMatched);

    if (!isPasswordMatched) {
        return next(new ApiError(400, "Invalid email or password"));
    }
    console.log("Login Successful");


    const userToken = generateUserToken(userExist)
    console.log('userToken : ', userToken);

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

export const logout = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    res.cookie("userToken", null, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });

    return handleResponse(req, res, 200, "Logout Successful");
})

export const forgotPassword = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    console.log("Request Body : ", req.body);

    if (!email) {
        console.log("Email not found : ", email);
        return next(new ApiError(400, "Email is required"));
    }

    const Existeduser = await UserModel.findOne({ email });
    if (!Existeduser) {
        console.log("User not found with this email : ", email);
        return next(new ApiError(400, "User not found"));
    }

    const otp = generateOtp();
    console.log("Generated OTP : ", otp);

    await redis.set(`otp:${Existeduser._id}`, otp, { 'EX': 180 });

    if (email) {
        console.log(`Sending OTP ${otp} to email ${email}`);
        await sendEmail(email, otp);
        console.log(sendEmail(email, otp));
    }
    return handleResponse(req, res, 200, "OTP sent to your email");
});


export const verifyOtp = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { otp } = req.body;
    console.log("Request Body : ", req.body);

    if (!otp) {
        console.log("OTP not found");
        return next(new ApiError(400, "OTP is required"));
    }

    const SystemGeneratedOtp = await redis.get(`otp:${userId}`);
    console.log("SystemGeneratedOtp : ", SystemGeneratedOtp);

    if (!SystemGeneratedOtp) {
        console.log("OTP not found");
        return next(new ApiError(400, "OTP expired"));
    }

    if (SystemGeneratedOtp !== otp) {
        console.log("Invalid OTP");
        return next(new ApiError(400, "Invalid OTP"));
    }

    return handleResponse(req, res, 200, "OTP verified");
})

export const ResetPassword = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const { password } = req.body;
    const userId = req.user?._id;

    console.log("Request Body : ", req.body);

    if (!password) {
        return next(new ApiError(400, "New password is required"));
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(password, salt);


    const user = await UserModel.findByIdAndUpdate(userId, {
        password: newHashedPassword
    }, {
        new: true,
        runValidators: true,
        useFindAndModify: false
    });
    console.log("User found : ", user);

    if (!user) {
        return next(new ApiError(400, "User not found"));
    }

    return handleResponse(req, res, 200, "Password reset successfully");
})

export const googleAuthLogin = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    console.log("Clent : ", client)

    const { userToken } = req.body;
    console.log("User Token : ", userToken);

    const ticket = await client.verifyIdToken({
        idToken: userToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    console.log("Ticket : ", ticket);

    const payload: TokenPayload | undefined = ticket.getPayload();
    console.log("Payload : ", payload);
    if (!payload) {
        return next(new ApiError(400, "Invalid token"));
    }

    const name = payload.name ?? payload.given_name ?? "Unknown User";
    const email = payload.email;

    if (!name || !email) {
        return next(new ApiError(400, "Invalid token"));
    }

    const userFind = await UserModel.findOne({ email });
    if (!userFind) {
        const userCreated = await UserModel.create({
            name,
            email
        });
        console.log("User created : ", userCreated);

        const userToken = generateUserToken(userCreated);

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
            { user: userCreated, token: userToken }
        );
    } else {
        const userToken = generateUserToken(userFind);

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
            { user: userFind, token: userToken }
        );
    }
})

export const getUserProfile = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    console.log("User Id : ", userId);

    if (!userId) {
        console.log("Not get userId", userId);
        return next(new ApiError(400, "User not found"));
    }

    const user = await UserModel.findById(userId);
    console.log("User found : ", user);

    if (!user) {
        console.log("User not found", user);
        return next(new ApiError(400, "User not found"));
    }

    return handleResponse(req, res, 200, "User found", user);
})


export const updateUserProfile = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    console.log("User Id : ", userId);


    const { name, email, address, phone, age, dob, avatar } = req.body;
    console.log("Request Body : ", req.body);

    const updateUserDetail = await UserModel.findByIdAndUpdate(
        userId,
        {
            name,
            email,
            address,
            phone,
            age,
            dob,
            avatar
        }, {
        new: true,
        runValidators: true
    });
    console.log("User updated : ", updateUserDetail);

    if (!updateUserDetail) {
        return next(new ApiError(400, "User not found"));
    }
    return handleResponse(req, res, 200, "User updated", updateUserDetail);

})
