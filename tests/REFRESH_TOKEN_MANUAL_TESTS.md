# Refresh Token Auth — Manual Test Plan

End-to-end manual verification for the access-token + refresh-token rotation system.
Use this alongside the bun:test suites in `tests/`.

---

## 0. Setup

### 0.1 Environment variables (`config/.env`)

```
PORT=4000
DB_URI=mongodb://localhost:27017/service1
REDIS_HOST=localhost
REDIS_PORT=6379
USER_SECRET_KEY=please-change-me-to-a-long-random-string
INTERNAL_SERVICE_API_KEY=internal-secret
# Optional override knobs (defaults shown):
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=60
```

### 0.2 Start backend

```bash
# Unix / macOS
cd "Service1 backend"
bun install
bun run dev
```

```powershell
# Windows PowerShell
cd "Service1 backend"
bun install
bun run dev
```

### 0.3 Convenience variables

```bash
# Unix / macOS
BASE=http://localhost:4000/api/v1
EMAIL=test+$(date +%s)@example.com
PASS='TestPass123!'
```

```powershell
# Windows PowerShell
$BASE = "http://localhost:4000/api/v1"
$EMAIL = "test+$([DateTimeOffset]::Now.ToUnixTimeSeconds())@example.com"
$PASS  = "TestPass123!"
```

### 0.4 Conventions

- All cURL examples use `-c cookies.txt -b cookies.txt` to persist cookies across requests (mimics a browser session).
- Where the response body must be inspected for `accessToken` / `refreshToken`, pipe through `jq` (Unix) or `ConvertFrom-Json` (PowerShell).
- Each test states: **Command**, **Expected HTTP status**, **Expected response keys**, **Expected DB state**.

---

## Scenarios

### T01 — Signup new user

**Unix**
```bash
curl -i -c cookies.txt -X POST "$BASE/users/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"phone\":\"+15551112222\"}"
```
**PowerShell**
```powershell
curl.exe -i -c cookies.txt -X POST "$BASE/users/signup" `
  -H 'Content-Type: application/json' `
  -d "{`"name`":`"Tester`",`"email`":`"$EMAIL`",`"password`":`"$PASS`",`"phone`":`"+15551112222`"}"
```
- **Expected status:** `201` (or `200` depending on signup contract)
- **Response keys:** `success: true`, `data.user._id`, `data.user.email`
- **DB state:** `users` collection has new doc, no `refreshtokens` row yet (refresh token issued only on **login**, not signup, unless the implementation auto-logs-in).

---

### T02 — Verify email (skip / stub OTP if needed)

Use the OTP-verify endpoint your project exposes (`POST /api/v1/users/verify-email`) or update `isEmailVerified: true` directly in Mongo for the test user.

- **Expected status:** `200`
- **DB state:** `users.<user>.isEmailVerified === true`

---

### T03 — Login (happy path)

**Unix**
```bash
curl -i -c cookies.txt -b cookies.txt -X POST "$BASE/users/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
```
**PowerShell**
```powershell
curl.exe -i -c cookies.txt -b cookies.txt -X POST "$BASE/users/login" `
  -H 'Content-Type: application/json' `
  -d "{`"email`":`"$EMAIL`",`"password`":`"$PASS`"}"
```
- **Expected status:** `200`
- **Response keys:** `success`, `data.user`, `data.token`, `data.accessToken`, `data.refreshToken` (128 hex chars).
- **Cookies set (response `Set-Cookie` headers, 3 of them):**
  - `accessToken=...; HttpOnly; Path=/`
  - `refreshToken=...; HttpOnly; Path=/api/v1/users`
  - `userToken=...; HttpOnly; Path=/`  (legacy alias = accessToken)
- **DB state:** new `refreshtokens` doc, `tokenHash` = SHA-256 of returned `refreshToken`, `revokedAt = null`, `replacedByHash = null`, `userAgent` + `ipAddress` populated.

---

### T04 — Login with wrong password

```bash
curl -i -X POST "$BASE/users/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"WRONG\"}"
```
- **Expected status:** `401` (or `400`)
- **Response keys:** `success: false`, `message` mentions invalid creds.
- **DB state:** no new refresh-token row.

---

### T05 — Login with non-existent email

```bash
curl -i -X POST "$BASE/users/login" -H 'Content-Type: application/json' \
  -d '{"email":"ghost@nowhere.com","password":"x"}'
```
- **Expected status:** `401` / `404`
- **DB state:** unchanged.

---

### T06 — Access protected endpoint with cookie

```bash
curl -i -b cookies.txt "$BASE/users/profile"
```
- **Expected status:** `200`
- **Response keys:** `data.user._id` matches the logged-in user.

---

### T07 — Access protected endpoint with `Authorization: Bearer`

Grab the `accessToken` from T03 response body, then:
```bash
AT='<paste-accessToken>'
curl -i "$BASE/users/profile" -H "Authorization: Bearer $AT"
```
- **Expected status:** `200`

---

### T08 — Access protected endpoint with no token

```bash
curl -i "$BASE/users/profile"
```
- **Expected status:** `401`
- **Response:** `Unauthorized: Please login first`

---

### T09 — Access protected endpoint with tampered token

```bash
BAD="${AT}xxxxx"
curl -i "$BASE/users/profile" -H "Authorization: Bearer $BAD"
```
- **Expected status:** `401`

---

### T10 — Access protected endpoint with forged `alg:none` token

```bash
# header.payload. (empty signature)
FORGED='eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJfaWQiOiJldmlsIiwicm9sZSI6IkFETUlOIn0.'
curl -i "$BASE/users/profile" -H "Authorization: Bearer $FORGED"
```
- **Expected status:** `401`
- **Critical:** must NEVER return 200. If it does, JWT verifier is not algorithm-pinned.

---

### T11 — Force access-token expiry, refresh succeeds

1. Set `ACCESS_TOKEN_TTL=5s` in `.env`, restart, re-login (T03).
2. Wait 6 seconds.
3. Try T06 → expect `401`.
4. Hit refresh:

```bash
curl -i -b cookies.txt -c cookies.txt -X POST "$BASE/users/refresh-token"
```
- **Expected status:** `200`
- **Response keys:** `data.accessToken` (new), `data.refreshToken` (new, different from previous).
- **Cookies:** all 3 re-set with new values.
- **DB state:**
  - Old `refreshtokens` row: `revokedAt` set, `replacedByHash` = SHA-256 of NEW refresh token.
  - New `refreshtokens` row: created, `revokedAt = null`.

---

### T12 — After refresh, new access token works

```bash
curl -i -b cookies.txt "$BASE/users/profile"
```
- **Expected status:** `200`

---

### T13 — Refresh with missing token (no cookie, no body)

```bash
curl -i -X POST "$BASE/users/refresh-token"
```
- **Expected status:** `401`

---

### T14 — Refresh with random token not in DB

```bash
curl -i -X POST "$BASE/users/refresh-token" \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"deadbeef0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"}'
```
- **Expected status:** `401`

---

### T15 — Refresh with expired token

1. Insert a refresh-token row manually in Mongo with `expiresAt: new Date(Date.now() - 1000)` for your user, copy the raw token used to compute the hash.
2. Call refresh with that raw token.
- **Expected status:** `401`

---

### T16 — Refresh REUSE detection (critical)

1. Login (T03). Save raw refresh token as `RT1`.
2. Refresh once (T11) — succeeds; old row revoked, `RT2` issued.
3. Now reuse `RT1` (the revoked one):
```bash
curl -i -X POST "$BASE/users/refresh-token" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT1\"}"
```
- **Expected status:** `401`
- **Response message:** `Session invalidated` (or similar)
- **DB state:** **ALL** refresh-token rows for that user are now revoked (`revokedAt` set on `RT2` as well). Verify in Mongo:
```js
db.refreshtokens.find({ userId: ObjectId("<id>") })
// every doc must have revokedAt != null
```

---

### T17 — Refresh from request body when cookie missing (mobile flow)

```bash
curl -i -X POST "$BASE/users/refresh-token" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT_CURRENT\"}"
```
- **Expected status:** `200`
- Note: the rotation rules in T11/T16 still apply.

---

### T18 — Logout (happy path)

```bash
curl -i -b cookies.txt -c cookies.txt -X POST "$BASE/users/logout"
```
- **Expected status:** `200`
- **Response:** `Set-Cookie` clears `accessToken`, `refreshToken`, `userToken` (Max-Age=0 or `Expires` in past).
- **DB state:** the current refresh-token row has `revokedAt` set.

---

### T19 — After logout, protected endpoint blocks

```bash
curl -i -b cookies.txt "$BASE/users/profile"
```
- **Expected status:** `401`

---

### T20 — After logout, refresh blocks

```bash
curl -i -b cookies.txt -X POST "$BASE/users/refresh-token"
```
- **Expected status:** `401`

---

### T21 — Logout when no refresh-token cookie present

```bash
# logged in via Bearer only; no cookies file
curl -i -X POST "$BASE/users/logout" -H "Authorization: Bearer $AT"
```
- **Expected status:** `200` (idempotent)
- **Response:** still includes Set-Cookie clear directives.

---

### T22 — Forgot password regression

```bash
curl -i -X POST "$BASE/users/forgot-password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"
```
- **Expected status:** `200`
- **Side effects:** OTP/email sent. Should NOT issue refresh token.

---

### T23 — Reset password regression

```bash
curl -i -X POST "$BASE/users/reset-password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"<otp>\",\"newPassword\":\"NewPass456!\"}"
```
- **Expected status:** `200`
- **Side effect (recommended):** all existing refresh tokens for that user are revoked (forces re-login on other devices). Verify in DB.

---

### T24 — Google login regression — first time

```bash
curl -i -X POST "$BASE/users/google-login" \
  -H 'Content-Type: application/json' \
  -d '{"idToken":"<google-id-token>"}'
```
- **Expected status:** `200`
- **Response keys:** same shape as T03 — `token`, `accessToken`, `refreshToken`.
- **DB state:** new user created (if first time), one refresh-token row.

---

### T25 — Google login regression — returning user

Repeat T24 with same Google account.
- **Expected status:** `200`
- **DB state:** new refresh-token row added (does NOT revoke prior rows — multi-device).

---

### T26 — Cross-device login: 2 refresh tokens for same user

1. Device A: login (T03). Save `RT_A`.
2. Device B (use a different cookie jar or `Authorization` only): login again.
```bash
curl -i -c cookiesB.txt -X POST "$BASE/users/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
```
- **Expected DB state:** 2 active refresh-token rows for the user, distinct `tokenHash`.

---

### T27 — Logout from device A does NOT kill device B

1. Device A: `POST /users/logout` (T18).
2. Device B: `GET /users/profile` with its cookies/Bearer.
- **Expected status (B):** `200`
- **DB state:** only Device A's refresh-token row is revoked; Device B's still active.

---

### T28 — Bearer header overrides cookie (priority check)

1. Logged in via cookies (T03) as user X.
2. Build a Bearer token for user Y (or just use a different valid access token).
```bash
curl -i -b cookies.txt -H "Authorization: Bearer $AT_FOR_Y" "$BASE/users/profile"
```
- **Expected status:** `200`
- **Response:** profile is **user Y's**, proving Bearer wins. (Useful for SDK / mobile callers that override session cookies.)

---

### T29 — Gateway mode: trusted headers populate user

```bash
curl -i "$BASE/users/profile" \
  -H "x-internal-api-key: internal-secret" \
  -H "x-user-id: 507f1f77bcf86cd799439011" \
  -H "x-user-role: CUSTOMER" \
  -H "x-user-email: gw@x.com"
```
- **Expected status:** `200`
- **Note:** no JWT involved; trusts the gateway. If `INTERNAL_SERVICE_API_KEY` is missing/wrong → `401`.

---

### T30 — Gateway mode: bad internal key falls back to JWT

```bash
curl -i "$BASE/users/profile" \
  -H "x-internal-api-key: WRONG" \
  -H "x-user-id: 507f1f77bcf86cd799439011" \
  -H "x-user-role: ADMIN"
```
- **Expected status:** `401` (no JWT supplied either)

---

### T31 — Admin-only endpoint rejects CUSTOMER

```bash
# logged in as CUSTOMER
curl -i -b cookies.txt "$BASE/admin/some-admin-route"
```
- **Expected status:** `403`

---

### T32 — TTL boundary: refresh-token after `REFRESH_TOKEN_TTL_DAYS`

1. In Mongo, manually backdate a refresh-token row: `expiresAt = new Date(Date.now()-1)`.
2. Call refresh.
- **Expected status:** `401`
- **DB state:** Mongo TTL monitor will eventually delete the doc (within ~60s of `expiresAt`).

---

### T33 — Concurrent refresh race

Two parallel calls to `POST /users/refresh-token` with the same `RT` (use `xargs -P2` or two terminals).
- **Expected behaviour:** **exactly one** call returns `200`; the other returns `401` (and triggers reuse detection on subsequent calls, revoking all). Document any deviation — race-safety is critical here.

---

### T34 — CSRF consideration (informational)

The refresh-token cookie:
- `HttpOnly` — prevents JS read.
- `Path=/api/v1/users` — limits attack surface.
- Recommend `SameSite=Lax` (default acceptable for non-iframe sites) and `Secure` in production.
- Recommend `SameSite=Strict` for `refreshToken` cookie specifically.
- Without `SameSite`, a malicious site could POST `/users/refresh-token` with the user's cookie (browser sends it automatically) and read the new refresh token from the response — UNLESS the endpoint also requires a non-cookie credential (e.g. CSRF header or the body `refreshToken` field as a double-submit).

Check headers:
```bash
curl -i -c cookies.txt -X POST "$BASE/users/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | grep -i 'Set-Cookie'
```
- **Expected:** every cookie has `HttpOnly`; refresh cookie additionally has `SameSite=Lax` (or stricter) and `Secure` in production builds.

---

## Postman collection (importable)

Save as `refresh-token.postman_collection.json` and import in Postman.

```json
{
  "info": {
    "name": "Service1 - Refresh Token Auth",
    "_postman_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "BASE", "value": "http://localhost:4000/api/v1" },
    { "key": "EMAIL", "value": "test@example.com" },
    { "key": "PASS", "value": "TestPass123!" },
    { "key": "accessToken", "value": "" },
    { "key": "refreshToken", "value": "" }
  ],
  "item": [
    {
      "name": "01 Signup",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{BASE}}/users/signup",
        "body": {
          "mode": "raw",
          "raw": "{\"name\":\"Tester\",\"email\":\"{{EMAIL}}\",\"password\":\"{{PASS}}\",\"phone\":\"+15551112222\"}"
        }
      }
    },
    {
      "name": "02 Login",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "const j = pm.response.json();",
              "pm.collectionVariables.set('accessToken', j.data.accessToken);",
              "pm.collectionVariables.set('refreshToken', j.data.refreshToken);",
              "pm.test('returns accessToken', () => pm.expect(j.data.accessToken).to.be.a('string'));",
              "pm.test('returns refreshToken (128 hex)', () => pm.expect(j.data.refreshToken).to.match(/^[0-9a-f]{128}$/));"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{BASE}}/users/login",
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"{{EMAIL}}\",\"password\":\"{{PASS}}\"}"
        }
      }
    },
    {
      "name": "03 Profile (Bearer)",
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{accessToken}}" }],
        "url": "{{BASE}}/users/profile"
      }
    },
    {
      "name": "04 Refresh",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "const j = pm.response.json();",
              "pm.test('rotates refresh token', () => pm.expect(j.data.refreshToken).to.not.equal(pm.collectionVariables.get('refreshToken')));",
              "pm.collectionVariables.set('accessToken', j.data.accessToken);",
              "pm.collectionVariables.set('refreshToken', j.data.refreshToken);"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{BASE}}/users/refresh-token",
        "body": {
          "mode": "raw",
          "raw": "{\"refreshToken\":\"{{refreshToken}}\"}"
        }
      }
    },
    {
      "name": "05 Refresh Reuse (should 401)",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('reuse blocked', () => pm.expect(pm.response.code).to.equal(401));"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{BASE}}/users/refresh-token",
        "body": {
          "mode": "raw",
          "raw": "{\"refreshToken\":\"REPLAY_OLD_RT_HERE\"}"
        }
      }
    },
    {
      "name": "06 Logout",
      "request": {
        "method": "POST",
        "header": [{ "key": "Authorization", "value": "Bearer {{accessToken}}" }],
        "url": "{{BASE}}/users/logout"
      }
    },
    {
      "name": "07 Profile after logout (should 401)",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('blocked after logout', () => pm.expect(pm.response.code).to.equal(401));"
            ]
          }
        }
      ],
      "request": {
        "method": "GET",
        "header": [{ "key": "Authorization", "value": "Bearer {{accessToken}}" }],
        "url": "{{BASE}}/users/profile"
      }
    },
    {
      "name": "08 Forged alg:none (should 401)",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('alg:none rejected', () => pm.expect(pm.response.code).to.equal(401));"
            ]
          }
        }
      ],
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJfaWQiOiJldmlsIiwicm9sZSI6IkFETUlOIn0."
          }
        ],
        "url": "{{BASE}}/users/profile"
      }
    }
  ]
}
```
