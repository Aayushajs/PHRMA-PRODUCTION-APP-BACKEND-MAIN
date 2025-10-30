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

// Signup
export const signup = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, phone, age, dob, role, fcmToken, address } =
      req.body;

    console.log("Request Body : ", req.body);

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

    // Handle profile image if provided during signup
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: `Epharma/profiles`,
        });
        userData.ProfileImage = [uploadResult.secure_url];
      } catch (error) {
        console.error("Image upload failed:", error);
        // Continue signup without image if upload fails
      }
    }

    const user = await UserModel.create(userData);
    console.log("User created successfully with all fields");

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

    return handleResponse(req, res, 201, "User Created Successfully", User);
  }
);

// Login
export const login = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, fcmToken, location } = req.body;
    console.log("Request Body : ", req.body);

    if (!email || !password) {
      return next(new ApiError(400, "Email and password are required"));
    }

    const userExist = await UserModel.findOne({ email }).select("+password");
    console.log("User found : ", userExist);

    if (!userExist) {
      return next(new ApiError(400, "User does not exist"));
    }

    const isPasswordMatched = await bcrypt.compare(
      password,
      userExist.password
    );
    console.log("Password matched : ", isPasswordMatched);

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
    console.log("Login Successful - User updated");

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
      maxAge: 24 * 60 * 60 * 1000,
    });

    return handleResponse(req, res, 200, "Login Successful", {
      user: userData,
      token: userToken,
    });
  }
);

//logout
export const logout = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    res.cookie("userToken", null, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return handleResponse(req, res, 200, "Logout Successful");
  }
);

export const forgotPassword = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
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

    await redis.set(`otp:${Existeduser._id}`, otp, { EX: 180 });

    if (email) {
      console.log(`Sending OTP ${otp} to email ${email}`);
      await sendEmail(email, otp);
      console.log(sendEmail(email, otp));
    }
    return handleResponse(req, res, 200, "OTP sent to your email");
  }
);

export const verifyOtp = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

export const ResetPassword = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { password } = req.body;
    const userId = req.user?._id;

    console.log("Request Body : ", req.body);

    if (!password) {
      return next(new ApiError(400, "New password is required"));
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(password, salt);

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        password: newHashedPassword,
      },
      {
        new: true,
        runValidators: true,
        useFindAndModify: false,
      }
    );
    console.log("User found : ", user);

    if (!user) {
      return next(new ApiError(400, "User not found"));
    }

    return handleResponse(req, res, 200, "Password reset successfully");
  }
);

export const googleAuthLogin = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    console.log("Clent : ", client);

    const { userToken } = req.body;
    console.log("User Token : ", userToken);

    const ticket = await client.verifyIdToken({
      idToken: userToken,
      audience: process.env.GOOGLE_CLIENT_ID,
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
        email,
      });
      console.log("User created : ", userCreated);

      const userToken = generateUserToken(userCreated);

      res.cookie("userToken", userToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return handleResponse(req, res, 200, "Login Successful", {
        user: userCreated,
        token: userToken,
      });
    } else {
      const userToken = generateUserToken(userFind);

      res.cookie("userToken", userToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return handleResponse(req, res, 200, "Login Successful", {
        user: userFind,
        token: userToken,
      });
    }
  }
);

// Get User Profile
export const getUserProfile = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    console.log("User Id : ", userId);

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

export const updateUserProfile = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    console.log("User Id : ", userId);

    const { name, email, address, phone, age, dob, ProfileImage } = req.body;

    console.log("Request Body : ", req.body);

    const user = await UserModel.findById(userId);

    if (!user) {
      return next(new ApiError(400, "User not found"));
    }

    // Check email uniqueness
    if (email && email !== user.email) {
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return next(new ApiError(400, "Email already exists"));
      }
      user.email = email;
    }

    // Check phone uniqueness
    if (phone && phone !== user.phone) {
      const existingUser = await UserModel.findOne({ phone });
      if (existingUser) {
        return next(new ApiError(400, "Phone number already exists"));
      }
      user.phone = phone;
    }

    // Update other fields
    if (name) user.name = name;
    if (age !== undefined) user.age = age;
    if (dob) user.dob = dob;

    // Handle profile image update
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: `Epharma/profiles/${userId}`,
        });
        
        // Add to array and keep last 5
        if (!user.ProfileImage) user.ProfileImage = [];
        user.ProfileImage.push(uploadResult.secure_url);
        if (user.ProfileImage.length > 5) {
          user.ProfileImage = user.ProfileImage.slice(-5);
        }
      } catch (error) {
        console.error("Image upload error:", error);
        return next(new ApiError(500, "Failed to upload image"));
      }
    }

    // Update ProfileImage from body if provided
    if (ProfileImage && Array.isArray(ProfileImage)) {
      user.ProfileImage = ProfileImage;
    }

    // Update address
    if (address) {
      user.address = {
        ...user.address,
        ...address,
      };
    }

    await user.save();
    console.log("User updated successfully");

    // Remove password from response
    const userWithoutPassword = user.toObject();
    delete (userWithoutPassword as any).password;

    return handleResponse(
      req,
      res,
      200,
      "User profile updated successfully",
      userWithoutPassword
    );
  }
);

// Upload Profile Image
export const uploadProfileImage = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    console.log("User Id : ", userId);

    if (!userId) {
      return next(new ApiError(400, "User not found"));
    }

    if (!req.file) {
      return next(new ApiError(400, "No file uploaded"));
    }

    try {
      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: `Epharma/profiles/${userId}`,
      });

      console.log("File uploaded to Cloudinary:", uploadResult);

      // Find user and update ProfileImage array
      const user = await UserModel.findById(userId);

      if (!user) {
        return next(new ApiError(404, "User not found"));
      }

      // Add new image URL to ProfileImage array
      if (!user.ProfileImage) {
        user.ProfileImage = [];
      }

      user.ProfileImage.push(uploadResult.secure_url);

      // Keep only last 5 images (optional - aap remove kar sakte ho)
      if (user.ProfileImage.length > 5) {
        user.ProfileImage = user.ProfileImage.slice(-5);
      }

      await user.save();
      console.log("User profile image updated");

      return handleResponse(req, res, 200, "Profile image uploaded successfully", {
        imageUrl: uploadResult.secure_url,
        allImages: user.ProfileImage,
      });
    } catch (error: any) {
      console.error("Error uploading profile image:", error);
      return next(
        new ApiError(500, error.message || "Failed to upload profile image")
      );
    }
  }
);
