/*
┌───────────────────────────────────────────────────────────────────────┐
│  JWT Utility - Helper to generate and verify JSON Web Tokens.         │
└───────────────────────────────────────────────────────────────────────┘
*/
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });
const User_SK = process.env.USER_SECRET_KEY;
export const generateUserToken = (payload, expiresIn = "120d") => {
    const options = { expiresIn };
    return jwt.sign(payload, User_SK, options);
};
