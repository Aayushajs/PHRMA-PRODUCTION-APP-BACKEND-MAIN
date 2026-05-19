/*
┌───────────────────────────────────────────────────────────────────────┐
│  Auth Cookies Helper - Centralised cookie set/clear for auth tokens.  │
│                                                                       │
│  Sets three cookies:                                                  │
│    - accessToken     (httpOnly, 15m, path '/')                        │
│    - refreshToken    (httpOnly, 60d, path '/api/v1/users')            │
│    - userToken       (LEGACY back-compat = accessToken, path '/')     │
│                                                                       │
│  `secure` is enabled only in production so local dev over http works. │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response } from 'express';
import { REFRESH_TOKEN_TTL_DAYS } from './jwtToken';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_PATH = '/api/v1/users';

const isProd = (): boolean => process.env.NODE_ENV === 'production';

export const setAuthCookies = (
    res: Response,
    accessToken: string,
    refreshToken: string
): void => {
    const secure = isProd();

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: ACCESS_MAX_AGE_MS,
        path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: REFRESH_MAX_AGE_MS,
        path: REFRESH_COOKIE_PATH,
    });

    // Back-compat: legacy cookie still issued so old frontend builds
    // (which read `userToken`) keep working unchanged.
    res.cookie('userToken', accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: ACCESS_MAX_AGE_MS,
        path: '/',
    });
};

export const clearAuthCookies = (res: Response): void => {
    const secure = isProd();

    res.clearCookie('accessToken', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
    });

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: REFRESH_COOKIE_PATH,
    });

    res.clearCookie('userToken', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
    });
};
