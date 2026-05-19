/*
┌───────────────────────────────────────────────────────────────────────┐
│  OTP Generator - Utility for generating numeric One Time Passwords.   │
│  Uses crypto.randomInt (CSPRNG). Default length raised to 6 digits.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import crypto from 'node:crypto';

export const generateOtp = (length: number = 6): number => {
    if (length < 4 || length > 10) {
        throw new RangeError('OTP length must be between 4 and 10');
    }
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length); // crypto.randomInt upper bound is exclusive
    return crypto.randomInt(min, max);
};
