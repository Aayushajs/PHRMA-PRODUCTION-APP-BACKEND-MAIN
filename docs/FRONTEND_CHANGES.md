# Frontend Integration — Access + Refresh Token Auth

This document describes the auth changes shipped on the Service1 backend
and what frontend / mobile clients must do to integrate.

## What changed and why

We replaced the single long-lived JWT (`120d` expiry) with a standard
**access token + refresh token** flow:

| | Before | After |
|---|---|---|
| Access token TTL | 120 days | **15 minutes** |
| Refresh token | none | opaque random, 60 days |
| Storage | one cookie (`userToken`) | three cookies + body fields |
| Rotation | none | every refresh issues a NEW refresh token |
| Revocation | impossible | server-side store, can revoke any token |
| Theft detection | none | reusing a rotated refresh token revokes the whole chain |
| JWT `alg` | unpinned (vulnerable to `alg=none`) | pinned to `HS256` |

### Why it matters
1. A leaked access token is now only useful for **15 minutes**.
2. A leaked refresh token can be **revoked** server-side immediately.
3. If an attacker uses an old (rotated) refresh token, the server detects the
   reuse and **invalidates every session for that user** — forcing them to log
   back in but stopping the attacker dead.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/users/login` | none | Returns access + refresh tokens, sets cookies |
| POST | `/api/v1/users/google-login` | none | Same shape as `/login` |
| POST | `/api/v1/users/refresh-token` | refresh token | Rotates the pair, returns new access + refresh |
| POST | `/api/v1/users/logout` | access token | Revokes the presented refresh token, clears cookies |

### Login response (additive — no fields removed)

```json
{
  "success": true,
  "message": "Login Successful",
  "data": {
    "user": { "...": "..." },
    "token": "<accessToken>",          // back-compat alias
    "accessToken": "<accessToken>",    // NEW
    "refreshToken": "<refreshToken>"   // NEW
  }
}
```

### Cookies set by the server

| Cookie | TTL | Path | Notes |
|---|---|---|---|
| `accessToken` | 15 m | `/` | httpOnly, sameSite=lax, secure in prod |
| `refreshToken` | 60 d | `/api/v1/users` | scoped path — only sent to user routes |
| `userToken` | 15 m | `/` | LEGACY — equals `accessToken`, kept for old clients |

---

## Web client (React / Next / Vue / etc.)

The cookies are httpOnly so JS cannot read them — that's intentional (XSS-safe).
All you need to do is opt into sending cookies on cross-origin requests:

**fetch:**
```ts
fetch('/api/v1/...', { credentials: 'include' })
```

**axios:**
```ts
axios.defaults.withCredentials = true;
```

### Handling 401s (automatic refresh + retry)

Drop this interceptor in once; it will transparently refresh and retry any
401 from the API. On a refresh failure or "Session invalidated" message,
it kicks the user to `/login`.

```ts
// src/api/client.ts
import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // e.g. https://api.example.com
  withCredentials: true,
});

// Coalesce concurrent refreshes — only one refresh in flight at a time.
let refreshPromise: Promise<void> | null = null;

async function refreshTokens(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/api/v1/users/refresh-token', {})
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/users/refresh-token') &&
      !original.url?.includes('/users/login')
    ) {
      original._retried = true;
      try {
        await refreshTokens();
        return api(original); // retry once
      } catch (refreshErr) {
        // Refresh failed → forced logout.
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);
```

---

## Mobile (React Native / Expo / native iOS / Android)

Mobile platforms have no cookie jar by default, so we use the **response body
tokens** and the `Authorization` header instead.

1. On `/login` / `/google-login` response, store `accessToken` AND
   `refreshToken` in secure storage:
   - iOS Keychain
   - Android EncryptedSharedPreferences
   - Expo: `expo-secure-store`
2. Send `Authorization: Bearer <accessToken>` on every API call.
3. On 401, POST `/api/v1/users/refresh-token` with `{ refreshToken }` in the
   body. On success, **replace BOTH** stored tokens with the new ones from the
   response (rotation).
4. If refresh returns 401 with `"Session invalidated"`, wipe stored tokens and
   send the user back to login.

```ts
// src/api/client.ts  (React Native + expo-secure-store)
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

export const api = axios.create({
  baseURL: 'https://api.example.com',
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return null;

    try {
      const { data } = await axios.post(
        'https://api.example.com/api/v1/users/refresh-token',
        { refreshToken },
      );
      const newAccess = data?.data?.accessToken as string;
      const newRefresh = data?.data?.refreshToken as string;
      if (newAccess && newRefresh) {
        await SecureStore.setItemAsync(ACCESS_KEY, newAccess);
        await SecureStore.setItemAsync(REFRESH_KEY, newRefresh);
        return newAccess;
      }
      return null;
    } catch {
      await SecureStore.deleteItemAsync(ACCESS_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/refresh-token') &&
      !original.url?.includes('/login')
    ) {
      original._retried = true;
      const fresh = await refreshTokens();
      if (fresh) {
        original.headers = original.headers ?? {};
        (original.headers as any).Authorization = `Bearer ${fresh}`;
        return api(original);
      }
      // Session invalidated → navigate to login.
      // navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  },
);

export async function saveTokensFromLogin(data: {
  accessToken: string;
  refreshToken: string;
}) {
  await SecureStore.setItemAsync(ACCESS_KEY, data.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
```

---

## Logout

```ts
await api.post('/api/v1/users/logout');
await clearTokens(); // mobile only — web cookies are cleared by the server
```

Logout is **idempotent** — call it even if you think tokens are already gone.

---

## Rotation rules — IMPORTANT

- Every successful `/refresh-token` call returns a **NEW** `refreshToken`.
  You MUST replace the stored one with the new value. The old one is revoked
  the instant the new one is issued.
- If you ever send a refresh token twice (e.g. because you ignored the new
  one), the second call returns 401 with `"Session invalidated"` and **all**
  active sessions for that user are revoked. This is intentional — it is the
  theft-detection mechanism.

---

## Backward compatibility

| Field / cookie | Status |
|---|---|
| Response field `token` | Still present, equals `accessToken`. **Deprecated** — migrate to `accessToken`. |
| Cookie `userToken` | Still set, equals `accessToken`. **Deprecated** — relies on legacy fallback in middleware. |
| `Authorization: Bearer <jwt>` header | Unchanged — still accepted. |

Old builds that read `token` from the response or rely on the `userToken`
cookie continue to work. Plan to migrate within the next release cycle.

---

## Frontend test checklist

- [ ] Fresh login stores BOTH `accessToken` and `refreshToken` (mobile) or
      receives BOTH cookies (web).
- [ ] An authenticated request with an expired access token triggers exactly
      ONE refresh call, then succeeds.
- [ ] Two parallel requests that both hit a 401 produce only ONE refresh call
      (refresh coalescing).
- [ ] After refresh, the stored `refreshToken` is the new one, not the old one.
- [ ] Calling `/refresh-token` with an already-rotated token returns 401
      with message `"Session invalidated"` and clears local tokens.
- [ ] Logout clears cookies (web) / secure storage (mobile) and a subsequent
      API call is rejected with 401.
- [ ] Cross-origin requests use `credentials: 'include'` / `withCredentials`.
- [ ] CORS_ORIGINS on the server lists the exact frontend origin (no `*`).
- [ ] Login response still contains the legacy `token` field for back-compat.
- [ ] Mobile: `Authorization: Bearer <accessToken>` is sent on every request.
