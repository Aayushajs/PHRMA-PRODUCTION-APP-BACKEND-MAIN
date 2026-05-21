/*
┌───────────────────────────────────────────────────────────────────────┐
│  JWT Utility - Helpers for short-lived access tokens (JWT, HS256)     │
│  and opaque random refresh tokens.                                    │
│                                                                       │
│  - Access tokens: signed JWT, HS256 pinned, 15m TTL by default.       │
│  - Refresh tokens: 64-byte random hex, OPAQUE, stored as SHA-256.     │
│                                                                       │
│  generateUserToken is preserved as a thin deprecated alias of         │
│  generateAccessToken so existing call sites keep compiling.           │
└───────────────────────────────────────────────────────────────────────┘
*/

import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

// Prefer ACCESS_TOKEN_SECRET when set (clean rotation path),
// fall back to legacy USER_SECRET_KEY. Fail fast at module load.
const ACCESS_SECRET: Secret = (process.env.ACCESS_TOKEN_SECRET || process.env.USER_SECRET_KEY) as Secret;

if (!ACCESS_SECRET) {
    throw new Error(
        "[jwtToken] Neither ACCESS_TOKEN_SECRET nor USER_SECRET_KEY is set in env. " +
        "Refusing to start without a signing secret."
    );
}

// Exported constants — used by service / cookie helpers.
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 60;

type ExpiresIn = `${number}${"s" | "m" | "h" | "d"}`;

/**
 * Sign a short-lived JWT access token. Algorithm is pinned to HS256
 * to prevent "alg=none" / algorithm-confusion attacks.
 */
export const generateAccessToken = (
    payload: object,
    expiresIn: ExpiresIn = ACCESS_TOKEN_TTL as ExpiresIn
): string => {
    const options: SignOptions = { expiresIn, algorithm: 'HS256' };
    return jwt.sign(payload, ACCESS_SECRET, options);
};

/**
 * Verify a JWT access token. Throws on failure (invalid signature,
 * wrong algorithm, expired, malformed). Callers should treat any throw
 * as "unauthenticated".
 */
export const verifyAccessToken = (token: string): jwt.JwtPayload => {
    const decoded = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') {
        // Spec says verify can return string if payload was a string;
        // we never sign strings, so treat this as malformed.
        throw new jwt.JsonWebTokenError('Unexpected string payload');
    }
    return decoded;
};

/**
 * Generate a cryptographically random OPAQUE refresh token.
 * 64 bytes -> 128 hex chars. NOT a JWT, NOT verifiable client-side.
 */
export const generateRefreshToken = (): string => {
    return crypto.randomBytes(64).toString('hex');
};

/**
 * Hash a refresh token for storage. We never persist the raw token;
 * if the DB leaks, attackers can't replay tokens.
 */
export const hashRefreshToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

// One-shot deprecation flag — we only warn once per process.
let _deprecationWarned = false;

/**
 * @deprecated Use `generateAccessToken` instead. Kept as a thin alias so
 * existing imports keep compiling. NOTE: default TTL changed from "120d"
 * to "15m" — long-lived tokens are no longer issued.
 */
export const generateUserToken = (
    payload: object,
    expiresIn?: ExpiresIn
): string => {
    if (!expiresIn && !_deprecationWarned) {
        _deprecationWarned = true;
        console.warn(
            "[deprecation] generateUserToken() is deprecated — use generateAccessToken(). " +
            "Default TTL is now '15m' (was '120d'). Pair with refresh-token flow."
        );
    }
    return generateAccessToken(payload, expiresIn ?? (ACCESS_TOKEN_TTL as ExpiresIn));
};
