/*
┌───────────────────────────────────────────────────────────────────────┐
│  JWT Utility - Helper to generate and verify JSON Web Tokens.         │
└───────────────────────────────────────────────────────────────────────┘
*/

import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

const User_SK: Secret = process.env.USER_SECRET_KEY as string;

export const generateUserToken = (
    payload: object,
    expiresIn: `${number}${"s" | "m" | "h" | "d"}` = "120d"
): string => {
    const options: SignOptions = { expiresIn };
    return jwt.sign(payload, User_SK, options);
}   