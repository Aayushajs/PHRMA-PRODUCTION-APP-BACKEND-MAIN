/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Service - Business logic for user accounts and authentication.  │
│  Handles signup, login, profile management, and password resets.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import UserModel from "../Databases/Models/user.Models";
import bcrypt from "bcryptjs";
import { handleResponse } from "../Utils/handleResponse";
import { generateUserToken } from "../Utils/jwtToken";
import { generateOtp } from "../Utils/OtpGenerator";
import { redis } from "../config/redis";
import { sendEmail } from "../Utils/mailer";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import RoleIndex from "../Utils/Roles.enum";
import { uploadToCloudinary } from "../Utils/cloudinaryUpload";
import { sendPushNotification } from "../Utils/notification";

export default class UserService {
  public static signup = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        name,
        email,
        password,
        phone,
        age,
        dob,
        role,
        fcmToken,
        address
      } = req.body;

      const requiredFields = { name, email, password, phone };
      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return next(
          new ApiError(
            400,
            `Missing required fields: ${missingFields.join(", ")}`
          )
        );
      }

      const existingUser = await UserModel.findOne({
        $or: [{ email: email }, { phone: phone }],
      });

      if (existingUser) {
        if (existingUser.email === email) {
          return next(new ApiError(400, "User with this email already exists"));
        }
        if (existingUser.phone === phone) {
          return next(
            new ApiError(400, "User with this phone number already exists")
          );
        }
      }

      if (password.length < 6) {
        return next(new ApiError(400, "Password must be at least 6 characters"));
      }

      if (phone.length < 10) {
        return next(new ApiError(400, "Phone number must be at least 10 digits"));
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const userData: any = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        phone: phone.trim(),
        age: age || undefined,
        dob: dob || undefined,
        role: role || RoleIndex.CUSTOMER,
        lastLogin: new Date(),
        fcmToken: fcmToken || "",
      };

      if (address) {
        userData.address = {
          street: address.street || "",
          city: address.city || "",
          state: address.state || "",
          zip: address.zip || "",
          country: address.country || "India",
        };

        if (address.location) {
          userData.address.location = {
            longitude: address.location.longitude,
            latitude: address.location.latitude,
          };
        }
      }

      if (req.file) {
        try {
          const result = await uploadToCloudinary(
            req.file.buffer,
            "Epharma/profiles"
          );
          userData.ProfileImage = [result.secure_url];
        } catch (error: any) {
          return next(
            new ApiError(
              500,
              `Profile image upload failed: ${error.message || error}`
            )
          );
        }
      }

      const user = await UserModel.create(userData);

      const User = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        fcmToken: user.fcmToken,
        lastLogin: user.lastLogin,
        address: user.address,
        role: user.role,
        ProfileImage: user.ProfileImage || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      try {
        await sendEmail(user.email, 'welcome', { name: user.name });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }

      return handleResponse(req, res, 201, "User Created Successfully", User);
    }
  );

  // Login
  public static login = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password, fcmToken, location } = req.body;

      if (!email || !password) {
        return next(new ApiError(400, "Email and password are required"));
      }

      const userExist = await UserModel.findOne({
        email,
      }).select("+password");

      if (!userExist) {
        return next(new ApiError(400, "User does not exist"));
      }

      const isPasswordMatched = await bcrypt.compare(
        password,
        userExist.password
      );

      if (!isPasswordMatched) {
        return next(new ApiError(400, "Invalid email or password"));
      }

      // Update fields
      userExist.lastLogin = new Date();

      if (fcmToken) {
        userExist.fcmToken = fcmToken;
      }

      if (location && location.longitude && location.latitude) {
        userExist.address = userExist.address || {};
        userExist.address.location = {
          longitude: location.longitude,
          latitude: location.latitude,
        };
      }

      await userExist.save();

      const userObj = userExist.toObject();

      const userToken = generateUserToken({
        _id: userObj._id,
        email: userObj.email,
        role: userObj.role,
      });

      const userData = {
        _id: userObj._id,
        name: userObj.name,
        email: userObj.email,
        phone: userObj.phone,
        fcmToken: userObj.fcmToken,
        lastLogin: userObj.lastLogin,
        address: userObj.address,
        role: userObj.role,
        ProfileImage: userObj.ProfileImage || [],
        createdAt: userObj.createdAt,
        updatedAt: userObj.updatedAt,
      };

      res.cookie("userToken", userToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 14 * 24 * 60 * 60 * 1000,
      });

      if (userExist.fcmToken) {
        try {
          await sendPushNotification(
            userExist.fcmToken,
            "Welcome Back!",
            `Hello ${userExist.name}, you've successfully logged in to Velcart.`,
            { type: "login", timestamp: new Date().toISOString() }
          );
        } catch (notificationError) {
          console.error('Failed to send login notification:', notificationError);
        }
      }

      return handleResponse(req, res, 200, "Login Successful", {
        user: userData,
        token: userToken,
      });
    }
  );

  //logout
  public static logout = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      res.cookie("userToken", null, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 14 * 24 * 60 * 60 * 1000,
      });

      return handleResponse(req, res, 200, "Logout Successful");
    }
  );

  public static forgotPassword = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      if (!email) {
        return next(new ApiError(400, "Email is required"));
      }

      const Existeduser = await UserModel.findOne({ email });
      if (!Existeduser) {
        return next(new ApiError(400, "User not found"));
      }

      const otp = generateOtp();

      await redis.set(`otp:${Existeduser._id}`, otp, { EX: 180 });

      try {
        const result = await sendEmail(email, 'otp', { otp });
        const message = result.alternated
          ? `OTP sent via ${result.provider} (backup used)`
          : `OTP sent via ${result.provider}`;
        return handleResponse(req, res, 200, message, {
          provider: result.provider,
          alternated: result.alternated
        });
      } catch (emailError: any) {
        await redis.del(`otp:${Existeduser._id}`);
        return next(new ApiError(500, "Failed to send OTP. Please try again."));
      }
    }
  );

  public static verifyOtp = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { otp, email } = req.body;

      if (!otp || !email) {
        return next(new ApiError(400, "OTP and email are required"));
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = await UserModel.findOne({ email: normalizedEmail }).select("_id email").lean();

      if (!user) {
        return next(new ApiError(400, "Invalid request"));
      }

      const SystemGeneratedOtp = await redis.get(`otp:${user._id}`);

      if (!SystemGeneratedOtp) {
        return next(new ApiError(400, "OTP expired or invalid"));
      }

      if (SystemGeneratedOtp !== otp) {
        return next(new ApiError(400, "Invalid OTP"));
      }

      await redis.del(`otp:${user._id}`);
      await redis.set(`reset_verified:${user._id}`, "1", { EX: 600 });

      return handleResponse(req, res, 200, "OTP verified successfully", {
        resetToken: true,
      });
    }
  );

  public static ResetPassword = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { password, email } = req.body;

      if (!email || !password) {
        return next(new ApiError(400, "Email and password are required"));
      }

      if (password.length < 4) {
        return next(new ApiError(400, "Password must be at least 4 characters"));
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await UserModel.findOne({ email: normalizedEmail }).select("+password");

      if (!user) {
        return next(new ApiError(400, "Invalid request"));
      }

      const resetVerified = await redis.get(`reset_verified:${user._id}`);
      if (!resetVerified) {
        return next(new ApiError(403, "Unauthorized. Please verify OTP first"));
      }

      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return next(new ApiError(400, "New password cannot be same as old password"));
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      user.password = hashedPassword;
      await user.save({ validateBeforeSave: false });

      await redis.del(`reset_verified:${user._id}`);
      await redis.del(`otp:${user._id}`);

      try {
        await sendEmail(normalizedEmail, 'notification', {
          name: user.name
        });
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
      }

      return handleResponse(req, res, 200, "Password reset successfully");
    }
  );

  public static googleAuthLogin = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // console.log('🔐 Google Auth Login Starting...');
        // console.log('📝 Request body:', {
        //   userToken: req.body.userToken ? req.body.userToken.substring(0, 50) + '...' : 'missing',
        //   fcmToken: req.body.fcmToken ? 'present' : 'missing',
        //   hasClientId: !!process.env.GOOGLE_CLIENT_ID
        // });

        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

        const { userToken, fcmToken } = req.body;

        if (!userToken) {
          // console.error('❌ Missing userToken in request body');
          // console.error('📦 Full body received:', req.body);
          return next(new ApiError(400, "No id token received from google"));
        }

        if (!process.env.GOOGLE_CLIENT_ID) {
          // console.error('❌ GOOGLE_CLIENT_ID not configured in .env');
          return next(new ApiError(500, "Google Client ID not configured on server"));
        }

        // console.log('🔐 Verifying Google token with Client ID:', process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...');
        let ticket;
        try {
          ticket = await client.verifyIdToken({
            idToken: userToken,
            audience: process.env.GOOGLE_CLIENT_ID,
          });
          // console.log('✅ Token verified successfully');
        } catch (tokenError: any) {
          // console.error('❌ Token verification failed:', {
          //   error: tokenError.message,
          //   code: tokenError.code,
          // });

          // Specific error messages for common issues
          if (tokenError.message.includes('Token used too early')) {
            return next(new ApiError(400, "Token used too early - please try again"));
          }
          if (tokenError.message.includes('Token used too late')) {
            return next(new ApiError(400, "Token expired - please sign in again"));
          }
          if (tokenError.message.includes('Invalid audience')) {
            return next(new ApiError(400, "Invalid Google Client ID configuration"));
          }

          return next(new ApiError(400, `Token verification failed: ${tokenError.message}`));
        }

        const payload: TokenPayload | undefined = ticket.getPayload();
        if (!payload) {
          console.error('❌ No payload from verified ticket');
          return next(new ApiError(400, "Invalid token payload - no data from Google"));
        }

        const name = payload.name ?? payload.given_name ?? "Unknown User";
        const email = payload.email;
        const picture = payload.picture;

        // console.log('👤 Extracted data from token:', {
        //   name: name ? name.substring(0, 30) : 'missing',
        //   email: email ? email : 'missing',
        //   picture: picture ? 'present' : 'missing'
        // });

        if (!name || !email) {
          console.error('❌ Invalid token: missing required fields', {
            name: !!name,
            email: !!email
          });
          return next(new ApiError(400, "Invalid token: missing name or email"));
        }

        // console.log('👤 Looking up user:', email);
        let user = await UserModel.findOne({ email });

        if (!user) {
          console.log('🆕 Creating new user from Google Sign-In:', email);
          // Create new user from Google Sign-In
          user = await UserModel.create({
            name,
            email,
            password: "",
            phone: "",
            role: RoleIndex.CUSTOMER,
            lastLogin: new Date(),
            fcmToken: fcmToken || "",
          });

          // console.log('User created with ID:', user._id);
          // console.log(`User details: ${JSON.stringify(user)}`);
          // console.log('✅ New user created via Google Sign-In:', email);
        } else {
          // console.log('🔄 Updating existing user:', email);

          user.lastLogin = new Date();
          if (fcmToken) {
            user.fcmToken = fcmToken;
          }
          if (picture && !user.ProfileImage?.includes(picture)) {
            user.ProfileImage = [picture];
          }
          await user.save();
          // console.log('✅ Existing user updated with Google Sign-In:', email);
        }

        // console.log('🔑 Generating JWT token...');
        const jwtToken = generateUserToken(user.toObject());;

        res.cookie("userToken", jwtToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: "lax",
          maxAge: 14 * 24 * 60 * 60 * 1000,
        });

        // console.log('✅ Google authentication complete');
        return handleResponse(req, res, 200, "Google Login Successful", {
          user: user,
          token: jwtToken,
        });
      } catch (error: any) {
        // console.error('❌ Google authentication error:', error);

        // Handle specific Google token verification errors
        if (error.message && error.message.includes('Token used too early')) {
          return next(new ApiError(400, "Token used too early - please try again"));
        }
        if (error.message && error.message.includes('Token used too late')) {
          return next(new ApiError(400, "Token expired - please sign in again"));
        }
        if (error.message && error.message.includes('Invalid audience')) {
          return next(new ApiError(400, "Invalid Google Client ID configuration"));
        }

        // Re-throw for catchAsyncErrors to handle
        throw error;
      }
    }
  );

  // Get User Profile
  public static getUserProfile = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?._id;

      if (!userId) {
        return next(new ApiError(400, "User not found"));
      }

      const user = await UserModel.findById(userId)
        .select("-password -__v -createdAt -updatedAt")
        .lean();

      if (!user) {
        return next(new ApiError(404, "User not found"));
      }

      //  response
      const formattedUser = {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        age: user.age || null,
        dob: user.dob || null,
        lastLogin: user.lastLogin || null,
        fcmToken: user.fcmToken || null,
        address: user.address || {},
        wishlistCount: user.wishlist?.length || 0,
        viewedItemsCount: user.viewedItems?.length || 0,
        itemsPurchasedCount: user.itemsPurchased?.length || 0,
        profileImage: user.ProfileImage || [],
      };

      return handleResponse(
        req,
        res,
        200,
        "User profile fetched successfully",
        formattedUser
      );
    }
  );

  public static updateUserProfile = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?._id;

      const requestBody = req.body || {};
      const {
        name,
        email,
        address,
        phone,
        age,
        dob,
        ProfileImage,
        fcmToken
      } = requestBody;

      if (!userId) {
        return next(new ApiError(400, "User authentication required"));
      }

      const user = await UserModel.findById(userId);

      if (!user) {
        return next(new ApiError(404, "User not found"));
      }

      if (email && email.trim() !== user.email) {
        const existingUser = await UserModel.findOne({ email: email.trim() });
        if (existingUser) {
          return next(new ApiError(400, "Email already exists"));
        }
        user.email = email.trim().toLowerCase();
      }

      if (phone && phone.trim() !== user.phone) {
        const existingUser = await UserModel.findOne({ phone: phone.trim() });
        if (existingUser) {
          return next(new ApiError(400, "Phone number already exists"));
        }
        user.phone = phone.trim();
      }

      // FCM token update
      if (fcmToken && fcmToken.trim()) {
        user.fcmToken = fcmToken.trim();
      }

      // Update other basic fields
      if (name && name.trim()) {
        user.name = name.trim();
      }

      if (age !== undefined && age !== null && age !== "") {
        const ageNumber = parseInt(age);
        if (ageNumber >= 0 && ageNumber <= 150) {
          user.age = ageNumber;
        }
      }

      if (dob) {
        user.dob = new Date(dob);
      }

      // Handle file upload for profile image
      if (req.file) {
        try {
          const uploadResult = await uploadToCloudinary(
            req.file.buffer,
            `Epharma/profiles/${userId}`
          );

          user.ProfileImage = [uploadResult.secure_url];
        } catch (error: any) {
          return next(
            new ApiError(500, `Failed to upload image: ${error.message || error}`)
          );
        }
      }

      if (ProfileImage && typeof ProfileImage === 'string' && ProfileImage.trim()) {
        user.ProfileImage = [ProfileImage.trim()];
      } else if (ProfileImage && Array.isArray(ProfileImage) && ProfileImage.length > 0) {
        const validUrl = ProfileImage.find(url => url && typeof url === 'string' && url.trim());
        if (validUrl) {
          user.ProfileImage = [validUrl.trim()];
        }
      }

      if (address && typeof address === 'object') {
        try {
          let addressData = address;
          if (typeof address === 'string') {
            addressData = JSON.parse(address);
          }

          if (!user.address) {
            user.address = {
              street: "",
              city: "",
              state: "",
              zip: "",
              country: "India"
            };
          }

          if (addressData.street !== undefined) user.address.street = addressData.street || "";
          if (addressData.city !== undefined) user.address.city = addressData.city || "";
          if (addressData.state !== undefined) user.address.state = addressData.state || "";
          if (addressData.zip !== undefined) user.address.zip = addressData.zip || "";
          if (addressData.country !== undefined) user.address.country = addressData.country || "India";

          // Handle location coordinates
          if (addressData.location && typeof addressData.location === 'object') {
            if (!user.address.location) {
              user.address.location = { longitude: 0, latitude: 0 };
            }

            if (addressData.location.longitude !== undefined) {
              user.address.location.longitude = parseFloat(addressData.location.longitude) || 0;
            }
            if (addressData.location.latitude !== undefined) {
              user.address.location.latitude = parseFloat(addressData.location.latitude) || 0;
            }
          }

        } catch (addressError: any) {
          return next(new ApiError(400, "Invalid address format"));
        }
      }

      try {
        await user.save();
      } catch (saveError: any) {
        return next(new ApiError(500, `Failed to update user: ${saveError.message}`));
      }

      // Prepare response data
      const userResponse = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        age: user.age,
        dob: user.dob,
        role: user.role,
        fcmToken: user.fcmToken,
        address: user.address || {},
        ProfileImage: user.ProfileImage || [],
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        wishlist: user.wishlist || [],
        viewedItems: user.viewedItems || [],
        itemsPurchased: user.itemsPurchased || []
      };

      return handleResponse(
        req,
        res,
        200,
        "User profile updated successfully",
        userResponse
      );
    }
  );
}
