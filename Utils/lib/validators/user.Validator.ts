/*
┌───────────────────────────────────────────────────────────────────────┐
│  user.Validator - Zod schemas for user.Routes endpoints.              │
│  Schemas mirror current service behavior; required fields match the   │
│  fields each service errors on if missing.                            │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, safeString, passthroughObjectNoOperators } from "./_shared";

// Address sub-schema accepted by signup/updateProfile. All sub-fields optional
// because the legacy services treat them as optional and default to "".
const addressSchema = z
    .object({
        street: safeString("street").optional(),
        city: safeString("city").optional(),
        state: safeString("state").optional(),
        zip: safeString("zip").optional(),
        country: safeString("country").optional(),
        location: z
            .object({
                longitude: z.union([z.number(), z.string()]).optional(),
                latitude: z.union([z.number(), z.string()]).optional(),
            })
            .passthrough()
            .optional(),
    })
    .passthrough();

// Signup mirrors UserService.signup: name/email/password/phone required, plus
// optional age/dob/fcmToken/address. role is intentionally NOT accepted (service
// security comment forbids honoring role from req.body).
export const signupSchema = z
    .object({
        name: safeString("name").min(1, "name is required"),
        email: safeString("email").email("Invalid email"),
        password: safeString("password").min(6, "Password must be at least 6 characters"),
        phone: safeString("phone").min(10, "Phone number must be at least 10 digits"),
        age: z.union([z.number(), z.string()]).optional(),
        dob: z.union([z.string(), z.date()]).optional(),
        fcmToken: safeString("fcmToken").optional(),
        address: addressSchema.optional(),
    })
    .passthrough();

// Login: email+password required; fcmToken, location optional.
export const loginSchema = z
    .object({
        email: safeString("email").min(1, "Email and password are required"),
        password: safeString("password").min(1, "Email and password are required"),
        fcmToken: safeString("fcmToken").optional(),
        location: z
            .object({
                longitude: z.union([z.number(), z.string()]).optional(),
                latitude: z.union([z.number(), z.string()]).optional(),
            })
            .passthrough()
            .optional(),
    })
    .passthrough();

// Google login: userToken required, fcmToken optional.
export const googleLoginSchema = z
    .object({
        userToken: safeString("userToken").min(1, "No id token received from google"),
        fcmToken: safeString("fcmToken").optional(),
    })
    .passthrough();

// Forgot password: email required.
export const forgotPasswordSchema = z
    .object({
        email: safeString("email").min(1, "Email is required"),
    })
    .passthrough();

// Verify OTP: otp + email required (service normalizes email).
export const verifyOtpSchema = z
    .object({
        otp: safeString("otp").min(1, "OTP and email are required"),
        email: safeString("email").min(1, "OTP and email are required"),
    })
    .passthrough();

// Reset password: email + password (>=8) required.
export const resetPasswordSchema = z
    .object({
        email: safeString("email").min(1, "Email and password are required"),
        password: safeString("password").min(8, "Password must be at least 8 characters"),
    })
    .passthrough();

// Refresh token: refreshToken optional in body (also accepted via cookie).
export const refreshTokenSchema = z
    .object({
        refreshToken: safeString("refreshToken").optional(),
    })
    .passthrough();

// Logout: refreshToken optional.
export const logoutSchema = refreshTokenSchema;

// Update profile: every field optional; rejects NoSQL operator keys.
// Uses passthrough so unknown fields are forwarded (multer fields + future).
export const updateProfileSchema = passthroughObjectNoOperators;
