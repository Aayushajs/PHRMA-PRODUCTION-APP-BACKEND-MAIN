# SECURITY AUDIT — Service1 Backend (E‑Pharmacy / Velcart)

- **Audit date:** 2026-05-19
- **Scope:** `Service1 backend/` (Node.js + TypeScript + Bun + Express + MongoDB + Redis + Socket.IO + Docker)
- **Auditor profile:** Principal-Level Security Engineer
- **Methodology:** Source code review (white-box), threat modeling, OWASP Top 10 (2021) mapping, dependency triage. No live exploitation performed.

---

## 1. EXECUTIVE SUMMARY

The Service1 backend exposes 11 public-facing route groups under `/api/v1` and is reachable on `0.0.0.0:5001` (Docker port `5000`). The codebase shows **systemic, foundational security weaknesses** in authentication, authorization, transport/header hygiene, multi-tenant trust, and inter-service authentication. Several findings constitute **immediate, unauthenticated full account takeover** primitives.

### Severity breakdown

| Severity | Count |
|----------|-------|
| CRITICAL | 9 |
| HIGH     | 14 |
| MEDIUM   | 12 |
| LOW      | 7  |
| **TOTAL** | **42** |

### Top 5 Critical Risks

1. **F-01 — Trivially Spoofable Identity Headers (Gateway Mode)** — `Middlewares/CheckLoginMiddleware.ts:38-56`. Any unauthenticated attacker who learns `INTERNAL_SERVICE_API_KEY` (a single shared secret used in 3+ routers including the public `/notification-service/send`) can impersonate **any user or admin** via `x-user-id` / `x-user-role` headers — full vertical privilege escalation.
2. **F-02 — `CORS origin: ['*']` with `credentials: true` + Permissive Allowed Headers** — `App.ts:20-25`. Browsers reject `*` + credentials, but the wildcard + reflection of `Authorization` and identity headers means CSRF on cookie-bearing endpoints is achievable via any browser/extension that doesn't enforce the spec or via non-browser clients.
3. **F-03 — Password Reset Authorization Bypass / Reset Without OTP** — `Services/user.Service.ts:323-371`. `ResetPassword` is gated by `userMiddleware` (requires an existing valid JWT) AND a Redis-stored `reset_verified:<userId>` flag derived from arbitrary `email`. An attacker authenticated as any user A can reset user B's password by passing `email=B@x.com` and `password=...` once B has ever triggered OTP verification (or via race + own OTP); also `verifyOtp` doesn't bind the OTP context to the authenticated session at all.
4. **F-04 — 4‑digit OTP using `Math.random()` (non‑CSPRNG) with no attempt limiter** — `Utils/OtpGenerator.ts:7-11` + `Services/user.Service.ts:289-321`. 10,000 possible values, no lockout, no rate limit anywhere in the app. Account takeover via OTP brute force in seconds.
5. **F-05 — JWT 120-day expiry, single shared secret, `none`/algo-confusion not pinned, no revocation/logout invalidation** — `Utils/jwtToken.ts:11-19`, `Middlewares/CheckLoginMiddleware.ts:74`, `Services/user.Service.ts:243-254`. `jwt.verify` does not pin algorithms; `USER_SECRET_KEY` is cast `as string` without strength check; logout only clears the cookie (does nothing for Authorization header tokens). A stolen JWT is valid for ~4 months.

### Additional critical (tied for top):
- **F-06** Mass-assignment + privilege escalation at signup (`role` accepted from request body — `Services/user.Service.ts:33,85`).
- **F-07** Hardcoded/insecure cookie flags — `secure:false`, `sameSite:'lax'` for the auth cookie on `/login` and `/logout` regardless of NODE_ENV (`Services/user.Service.ts:215-220, 245-250`).
- **F-08** Socket.IO `cors: { origin: '*', credentials: true }` + permissive auth claim parsing (accepts `id`/`userId`/`sub` interchangeably — confusion vector) — `config/socket.ts:18-53`.
- **F-09** MongoDB TLS verification fully disabled (`tlsAllowInvalidCertificates: true`, `tlsAllowInvalidHostnames: true`) — `Databases/db.ts:28-33`.

---

## 2. THREAT MODEL / ATTACK SURFACE

### 2.1 External attack surface
- HTTP on `0.0.0.0:5001` / Docker `5000:5000` — exposed to the world.
- WebSocket (Socket.IO) on the same port with `origin:'*'`.
- Public routes (no auth) under `/api/v1`:
  - `/health`, `/users/login`, `/users/signup`, `/users/forgot-password`, `/users/verify-otp`, `/users/google-login`
  - `/items/*` (most), `/categories/*` (GETs), `/categories/logs/*`, `/advertisements/debug`, `/advertisements/currently-running`, `/advertisements/active`, `/featured-medicines/`, `/notifications/health`, `/notifications/queue-stats`, etc.
- Inter-service endpoints: `/notification-service/*` (mostly internal), `/mail-service/*` (all internal), `/feature-flags/*` (admin) — all sharing the same `INTERNAL_SERVICE_API_KEY` static key.

### 2.2 Trust boundaries
- **Public client ↔ API**: defended only by JWT (HS256 default) and middleware role check.
- **Gateway/Other services ↔ API**: defended by a single static `x-internal-api-key` header. This trust path is also accepted on every request through `CheckLoginMiddleware.extractUserFromHeaders` — making the static API key a global impersonation token.
- **API ↔ MongoDB Atlas**: TLS, but certificate validation disabled.
- **API ↔ Redis**: plaintext (`redis://`).
- **API ↔ Firebase/SendGrid/Mailjet/Gmail SMTP/Cloudinary**: outbound only.

### 2.3 Sensitive data assets
- User credentials (bcrypt-hashed), PII (name, email, phone, DOB, address, geo-coords), OTPs (Redis), FCM tokens, JWT secret, Firebase service account (base64 in env), Cloudinary API secret, SendGrid/Mailjet/Gmail SMTP creds, internal API key.

### 2.4 Notable attacker profiles
- Unauthenticated internet user (most damaging given missing rate limits).
- Authenticated low-privilege CUSTOMER (vertical escalation via signup `role`, header spoofing if they obtain internal key, IDOR through admin log endpoints — see F-21).
- Adjacent compromised service (lateral movement via shared internal key).
- Malicious frontend (CSRF possible because cookie + `sameSite:lax` + permissive CORS).

---

## 3. FINDINGS

> Format per finding: Title · Severity · Category · Affected (path:line) · Technical explanation · Exploit · Impact · Suggested Fix (non-breaking) · Hardening recommendation.

---

### F-01 — Trivially Spoofable Identity via `x-user-*` Headers (Gateway Mode)
- **Severity:** CRITICAL
- **OWASP:** A01:2021 Broken Access Control / A07:2021 Identification & Authentication Failures
- **Affected:** `Middlewares/CheckLoginMiddleware.ts:17-22`, `38-56`, `App.ts:23` (CORS explicitly allows `x-user-id`, `x-user-role`, `x-user-email`)
- **Technical explanation:** `extractUserFromHeaders` returns a user identity built from `req.headers["x-user-id"]`, `x-user-role`, and `x-user-email` whenever the `x-internal-api-key` matches `INTERNAL_SERVICE_API_KEY`. This middleware runs on every authenticated route. The internal API key is a long-lived static value shared with Service 2 and is sent unencrypted across the network. Anyone in possession of that key (which is also written to logs in `internalServiceAuth.ts:19-20` as commented-out console.log lines and ships in `.env.docker`) can impersonate any user or admin by adding three headers. Worse — `CheckLoginMiddleware` does not even require that the request be a server-to-server call (no source IP allowlist, no mTLS, no path scoping). The internal key authenticates **public** routes such as `/api/v1/users/profile` or `/api/v1/advertisements/create` directly.
- **Exploit scenario:**
  ```
  POST /api/v1/feature-flags/create
  x-internal-api-key: <leaked-key>
  x-user-id: 000000000000000000000001
  x-user-role: ADMIN
  Content-Type: application/json
  { ... }
  ```
  → instant admin. Same headers grant access to every `adminMiddleware`-guarded route in `advertisement.Routes.ts`, `category.Routes.ts`, `featured.Routes.ts`, `featureFlag.Routes.ts`.
- **Production impact:** Complete compromise of all admin functionality; data exfiltration of all users via admin endpoints; ability to create/delete ads, categories, feature flags; ability to read other users' notification logs (F-21).
- **Suggested fix (non-breaking):**
  ```ts
  // CheckLoginMiddleware.ts
  const TRUSTED_INTERNAL_CIDRS = (process.env.INTERNAL_TRUSTED_CIDRS || '127.0.0.1/32,10.0.0.0/8').split(',');
  const isTrustedSource = (req: Request) => {
    const ip = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
    return TRUSTED_INTERNAL_CIDRS.some(c => cidrMatch(ip, c));
  };

  const isValidInternalServiceRequest = (req: Request): boolean => {
    const expectedKey = process.env.INTERNAL_SERVICE_API_KEY;
    const providedKey = req.headers["x-internal-api-key"];
    if (!expectedKey || !providedKey) return false;
    // Require BOTH a constant-time match AND trusted network origin
    return isTrustedSource(req) &&
      crypto.timingSafeEqual(Buffer.from(String(providedKey)), Buffer.from(expectedKey));
  };
  ```
  Plus: **never** allow `extractUserFromHeaders` to run for endpoints under `/users/*`, `/items/*`, etc. (public-facing). Gate by path prefix.
- **Hardening:** Replace static API key with mTLS or short-lived signed JWTs (S2S) issued by the gateway with `iss`, `aud`, `exp ≤ 60s`, and signed with a separate `INTERNAL_S2S_PUBLIC_KEY`. Strip `x-user-*` headers from inbound requests in a global pre-router.

---

### F-02 — CORS Wildcard + Credentials + Reflected Auth Headers
- **Severity:** CRITICAL
- **OWASP:** A05:2021 Security Misconfiguration / A07
- **Affected:** `App.ts:20-25`, `config/socket.ts:18-22`
- **Technical explanation:** The Express CORS config sets `origin: ['*']` with `credentials: true`. The CORS spec rejects this pairing in conformant browsers, but the express `cors` package will literally echo `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`. Combined with `sameSite: 'lax'` cookies, an attacker-controlled site cannot read responses but CAN trigger state-changing requests (CSRF) on any endpoint that accepts cookies (`userToken` cookie is set on login). Socket.IO uses the same `origin: "*"`, allowing arbitrary site to open WebSocket connections.
- **Exploit:** Malicious page issues a non-preflighted POST (e.g. `Content-Type: application/x-www-form-urlencoded` or `text/plain` with JSON body parsed via `express.urlencoded({extended:true})`) to `/api/v1/users/update/profile` — change email/phone of victim.
- **Impact:** CSRF leading to PII tampering, email takeover (then password reset).
- **Suggested fix (non-breaking):**
  ```ts
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://app.velcart.com').split(',');
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'), false);
    },
    methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'], // remove x-user-* — see F-01
    credentials: true,
  }));
  ```
  Preserves request/response shapes.
- **Hardening:** Set `helmet()` (currently absent), `sameSite:'strict'` for the auth cookie, and add a CSRF token for browser flows.

---

### F-03 — Password Reset Flow: OTP Decoupled From Caller, No Email Binding
- **Severity:** CRITICAL
- **OWASP:** A07:2021
- **Affected:** `Services/user.Service.ts:256-321`, `323-371`, `Routers/Routers/user.Routes.ts:25-27`
- **Technical explanation:** Multiple defects:
  1. `forgotPassword` accepts only `email` (no captcha, no rate limit, returns provider info revealing infra). It stores OTP at `otp:${user._id}`.
  2. `verifyOtp` accepts `{otp, email}` from request body with **no auth**. It looks up user by email, fetches OTP, on success sets `reset_verified:${user._id}` for **10 minutes**. Anyone who knows a victim's email and a 4-digit OTP (10k space, see F-04) can flip that flag.
  3. `ResetPassword` is guarded by `userMiddleware` (any authenticated user) but takes `{email, password}` from body. It **does not** require `email === req.user.email`. So an attacker who:
     - Created their own account (gets valid JWT for self), OR
     - Has a leaked JWT,
     can reset *any other* user's password as long as `reset_verified:<otherUserId>` is true (their own or one they've brute-forced).
  4. There is no rate limit on `/forgot-password` — unlimited OTPs and unlimited emails per second.
  5. OTP is 4 digits via `Math.random()` (F-04).
- **Exploit:** Attacker A creates account, logs in (gets JWT). For target T:
  - Call `forgot-password { email: T@x.com }` → OTP stored.
  - Brute force `verify-otp { otp: 0000..9999, email: T@x.com }` (10k tries; no rate limit). On success, `reset_verified:<T._id>` set.
  - Call `reset-password { email: T@x.com, password: 'x' }` with attacker's own JWT → T's password changed.
- **Impact:** Full account takeover of arbitrary users, including admins.
- **Suggested fix (non-breaking):**
  ```ts
  // verifyOtp: return a one-time reset token bound to the user, do NOT use Authorization.
  public static verifyOtp = catchAsyncErrors(async (req, res, next) => {
    const { otp, email } = req.body;
    if (!otp || !email) return next(new ApiError(400, "OTP and email are required"));
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select("_id email");
    if (!user) return next(new ApiError(400, "Invalid request")); // do not disclose
    const attemptsKey = `otp_attempts:${user._id}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 600);
    if (attempts > 5) return next(new ApiError(429, "Too many attempts"));
    const stored = await redis.get(`otp:${user._id}`);
    if (!stored || stored !== String(otp)) return next(new ApiError(400, "Invalid OTP"));
    await redis.del(`otp:${user._id}`);
    const resetTokenRaw = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetTokenRaw).digest('hex');
    await redis.set(`reset_token:${resetTokenHash}`, String(user._id), { EX: 600 });
    return handleResponse(req, res, 200, "OTP verified successfully", { resetToken: resetTokenRaw });
  });

  // ResetPassword: NO auth middleware; requires the resetToken from verifyOtp.
  public static ResetPassword = catchAsyncErrors(async (req, res, next) => {
    const { resetToken, password } = req.body;
    if (!resetToken || !password) return next(new ApiError(400, "resetToken and password required"));
    if (password.length < 12) return next(new ApiError(400, "Password must be at least 12 characters"));
    const hash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const userId = await redis.get(`reset_token:${hash}`);
    if (!userId) return next(new ApiError(403, "Invalid or expired reset token"));
    const user = await UserModel.findById(userId).select("+password");
    if (!user) return next(new ApiError(400, "Invalid request"));
    if (await bcrypt.compare(password, user.password)) return next(new ApiError(400, "Cannot reuse old password"));
    user.password = await bcrypt.hash(password, 12);
    await user.save({ validateBeforeSave: false });
    await redis.del(`reset_token:${hash}`);
    return handleResponse(req, res, 200, "Password reset successfully");
  });
  ```
  Note: this keeps the existing `{message, data}` response envelope. The frontend gains a `resetToken` field returned from `verify-otp` (already returns `{resetToken: true}` — change `true` to the actual opaque token) and supplies it to `reset-password`. Update `user.Routes.ts` to **remove** `userMiddleware` from `/reset-password`.
- **Hardening:** rate-limit `/forgot-password` to 3/h/email + 5/h/IP; emit identical responses for "user not found" vs success; use 6-digit OTP via `crypto.randomInt`; consider WebAuthn for high-value accounts.

---

### F-04 — Insecure OTP Generation (`Math.random`, 4 digits, no attempt cap)
- **Severity:** CRITICAL
- **OWASP:** A02:2021 Cryptographic Failures
- **Affected:** `Utils/OtpGenerator.ts:7-11`, `Services/user.Service.ts:269,289-321`, `Services/mail.Service.ts:46`
- **Technical explanation:** `Math.random()` is a non-cryptographic PRNG. Default OTP length is 4 (`generateOtp()` no argument). Mail service uses 6 but still via `Math.random`. No per-user attempt counter; no global rate limit.
- **Exploit:** 4-digit OTP = 10,000 values. Trivial automated brute force. Even 6-digit at 1M values is feasible with no lockout.
- **Suggested fix:**
  ```ts
  // Utils/OtpGenerator.ts
  import { randomInt } from "node:crypto";
  export const generateOtp = (length: number = 6): string => {
    const min = 10 ** (length - 1);
    const max = 10 ** length;
    return String(randomInt(min, max));
  };
  ```
  Callers already coerce to string; change `Services/user.Service.ts:271` to use 6-digit and store as string.
- **Hardening:** Add `otp_attempts:<userId>` counter (see F-03 fix); lock user after 5 wrong attempts for 15min.

---

### F-05 — JWT Hardening Gaps (algo not pinned, 120-day expiry, no revocation)
- **Severity:** CRITICAL
- **OWASP:** A02 / A07
- **Affected:** `Utils/jwtToken.ts:7-19`, `Middlewares/CheckLoginMiddleware.ts:74`, `Services/user.Service.ts:195-220, 243-254, 484`, `config/socket.ts:42`
- **Technical explanation:**
  - `jwt.verify(token, secret)` lacks `{ algorithms: ['HS256'] }`. If the secret is ever exposed AND a future jsonwebtoken version regresses, algorithm confusion is possible. More importantly, the lack of an `algorithms` allowlist is a textbook hardening miss.
  - Token TTL defaults to `120d`. Stolen tokens are good for 4 months.
  - No refresh token / sliding session. No `jti` claim. Logout (`user.Service.ts:243`) only nulls the cookie; the same token sent via `Authorization` header still authenticates.
  - No issuer/audience claims.
  - Secret read from `process.env.USER_SECRET_KEY as string` — if undefined, jwt.sign will throw at first request rather than at boot, but `jwt.verify` against `undefined` silently produces a "jwt malformed" pathway; not validated.
  - Socket.IO accepts `decoded.id || decoded.userId || decoded.sub` — but tokens are issued with `_id`. This means a JWT signed with `{id:'X'}` (an admin's typo or a different system) could authenticate. Confused claim handling.
- **Exploit:** A stolen JWT (e.g. from an exfiltrated mobile app log, a compromised XSS, or an internal Slack paste) is usable for 4 months across all services. No way to invalidate without rotating `USER_SECRET_KEY` globally.
- **Suggested fix (non-breaking):**
  ```ts
  // Utils/jwtToken.ts
  const SECRET = process.env.USER_SECRET_KEY;
  if (!SECRET || SECRET.length < 32) throw new Error("USER_SECRET_KEY must be ≥32 chars");
  export const generateUserToken = (payload: object, expiresIn = "7d") => {
    return jwt.sign(payload, SECRET, {
      algorithm: 'HS256',
      expiresIn,
      issuer: 'velcart-service1',
      audience: 'velcart-clients',
    });
  };
  export const verifyUserToken = (token: string) =>
    jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
      issuer: 'velcart-service1',
      audience: 'velcart-clients',
    });
  ```
  Update `CheckLoginMiddleware.ts:74` to call `verifyUserToken`. Keep cookie maxAge at current value but check token `exp` against a `jti` revocation list in Redis on each request (cheap O(1) GET).
  In `config/socket.ts:42-47`, drop `decoded.id || decoded.userId || decoded.sub` — accept only `decoded._id`.
- **Hardening:** Introduce refresh-token + short-lived access tokens (15 min access, 7d refresh, rotation on use). Add `jti`; logout writes `revoked:<jti>` → 1 with TTL = remaining lifetime.

---

### F-06 — Mass Assignment: `role` accepted from signup body → privilege escalation
- **Severity:** CRITICAL
- **OWASP:** A04:2021 Insecure Design / A01
- **Affected:** `Services/user.Service.ts:33, 85`
- **Technical explanation:** `signup` destructures `role` from `req.body` and writes it to `userData.role` unless missing. A user can self-register as `ADMIN`:
  ```
  POST /api/v1/users/signup
  { "name":"x","email":"x@x.com","password":"123456","phone":"1234567890","role":"ADMIN" }
  ```
  The schema enum (`user.Schema.ts:84-89`) accepts both `ADMIN` and `CUSTOMER`, so Mongoose will happily save it.
- **Exploit:** Direct, single-request admin promotion. No further steps.
- **Impact:** Complete admin compromise.
- **Suggested fix (non-breaking):**
  ```ts
  // user.Service.ts signup
  const { name, email, password, phone, age, dob, fcmToken, address } = req.body;
  // ignore body.role entirely
  ...
  const userData: any = {
    ...
    role: RoleIndex.CUSTOMER, // forced
    ...
  };
  ```
  Response shape unchanged.
- **Hardening:** Strip non-allowlisted fields with a generic sanitizer middleware; add a Zod/Joi DTO per route.

---

### F-07 — Cookie Flags: `secure: false`, weak `sameSite`, set even in production
- **Severity:** HIGH
- **OWASP:** A05
- **Affected:** `Services/user.Service.ts:215-220, 245-250` (login + logout), `Services/user.Service.ts:486-491` (googleAuthLogin partially correct but inconsistent)
- **Technical explanation:** `login` hard-codes `secure: false` and `sameSite: "lax"`. `googleAuthLogin` correctly uses `secure: process.env.NODE_ENV === 'production'`. Inconsistency means standard login leaks the cookie over HTTP and is exposed to CSRF/sub-domain attacks.
- **Suggested fix:**
  ```ts
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // align with shorter token TTL
  };
  res.cookie("userToken", userToken, cookieOpts);
  ```
- **Hardening:** Add `__Host-` prefix when path=/ + secure; rotate cookie name; consider double-submit CSRF token.

---

### F-08 — Socket.IO: wildcard origin, weak claim parsing, no per-event authorization
- **Severity:** HIGH
- **OWASP:** A05 / A01
- **Affected:** `config/socket.ts:18-90`
- **Technical explanation:** `origin:"*"` permits any web origin to open a socket. JWT secret is the same `USER_SECRET_KEY`, but the token claim is read from `decoded.id || decoded.userId || decoded.sub` — none of which are issued by `generateUserToken` (it uses `_id`). This means an attacker who can produce a token signed with the secret (or get one from a different system using the same secret) can authenticate even if `_id` is missing. `join:category` allows any authenticated user to join any category room — fine for general broadcast but acceptable. However, `role === 'admin'` check (`socket.ts:61`) compares to lowercase while role enum is `'ADMIN'` (uppercase) — bypass via misspelling means admin path never triggers (defense fails closed in this case; still wrong).
- **Suggested fix:**
  ```ts
  // config/socket.ts
  cors: {
    origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
    methods: ['GET','POST'],
    credentials: true,
  },
  ...
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;
  socket.data.user = { id: decoded._id, role: decoded.role, email: decoded.email };
  if (!socket.data.user.id) return next(new Error('Invalid claim'));
  ...
  if (socket.data.user.id === userId || socket.data.user.role === RoleIndex.ADMIN) { ... }
  ```
- **Hardening:** Use namespace-based isolation per role; throttle event rate; sign acknowledgments.

---

### F-09 — MongoDB TLS Certificate Validation Disabled
- **Severity:** HIGH
- **OWASP:** A02 / A05
- **Affected:** `Databases/db.ts:28-33`
- **Technical explanation:** When connecting to Atlas (`mongodb.net`), the code sets `tlsAllowInvalidCertificates: true` and `tlsAllowInvalidHostnames: true`. This disables certificate chain validation entirely — any TLS interceptor (MITM) is accepted.
- **Suggested fix:**
  ```ts
  if (isAtlas) {
    connectionOptions.tls = true;
    connectionOptions.tlsAllowInvalidCertificates = false;
    connectionOptions.tlsAllowInvalidHostnames = false;
  }
  ```
- **Hardening:** Pin a CA bundle via `tlsCAFile` for production; restrict DB network access by Atlas IP allowlist or PrivateLink.

---

### F-10 — `/forgot-password` reveals account existence + provider info, no rate limit
- **Severity:** HIGH
- **OWASP:** A04 / A07
- **Affected:** `Services/user.Service.ts:256-287`
- **Technical explanation:** Returns "User not found" on miss, "OTP sent via SendGrid" on hit. Enables user enumeration. No throttling enables enumeration of the entire user base.
- **Suggested fix:** Always return generic message regardless of existence. Add IP+email rate limit.
  ```ts
  if (!Existeduser) {
    // Always return the same response (timing-safe sleep optional)
    return handleResponse(req, res, 200, "If the email exists, an OTP has been sent");
  }
  // on success
  return handleResponse(req, res, 200, "If the email exists, an OTP has been sent");
  ```
- **Hardening:** Add `express-rate-limit` (5 req/h/IP for `/forgot-password`); strip `provider`/`alternated` from response.

---

### F-11 — NoSQL Operator Injection via `$or` regex on user-controlled search/company
- **Severity:** HIGH
- **OWASP:** A03:2021 Injection
- **Affected:** `Services/item.Service.ts:71-75, 117-121, 133-141`, `Services/category.Service.ts:325-332`
- **Technical explanation:** Search inputs are passed directly to `new RegExp(input, 'i')` and used inside `$regex`. Two attack classes:
  1. **ReDoS** — input like `(a+)+$` causes catastrophic backtracking and CPU exhaustion.
  2. **Regex-based exfiltration** — attacker uses `^A` prefix probes to enumerate fields character by character.
  Body parsing also accepts arbitrary JSON, so a value like `{"search": {"$ne": null}}` evaluates to `new RegExp({$ne:null}, 'i')` which throws, but adjacent fields like `HSNCode = req.query.HSNCode` (line 124) and `formula` accept any JSON-coerced object/array, which Mongoose interprets as operator query when injected.
- **Exploit:** `GET /api/v1/items?search=(.*)+$` → CPU pegged. Or in JSON body endpoints, attacker sends `{ "email": {"$gt": ""} }` to bypass login (see F-12).
- **Suggested fix:**
  ```ts
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search) {
    const safe = escapeRegex(String(search)).slice(0, 80);
    const re = new RegExp(safe, 'i');
    filterQuery.$or = [ { itemName: re }, { itemDescription: re }, { itemCompany: re }, { formula: re } ];
  }
  // Force scalar for params
  if (HSNCode) filterQuery.HSNCode = String(HSNCode);
  ```
- **Hardening:** Use Atlas Search/Mongo `$text` index; reject query params that are objects/arrays via a sanitizer middleware (`express-mongo-sanitize`).

---

### F-12 — `login` susceptible to NoSQL operator injection (no string coercion)
- **Severity:** HIGH
- **OWASP:** A03 / A07
- **Affected:** `Services/user.Service.ts:151-175`
- **Technical explanation:** `UserModel.findOne({ email })` where `email = req.body.email`. With `express.json({limit:'10mb'})` and no input sanitization, a body of `{"email": {"$gt": ""}, "password": "x"}` returns the first user. `bcrypt.compare("x", userExist.password)` still fails — but combined with **other lookups** (e.g. `forgotPassword` line 264) and operator-driven user enumeration, this is a precursor for harvesting.
- **Exploit:** `{"email":{"$gt":""},"password":"x"}` → no login granted (bcrypt fails) but you get "User does not exist" vs "Invalid email or password" distinction, enabling enumeration.
- **Suggested fix:** Coerce all auth identifiers to strings:
  ```ts
  const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) return next(new ApiError(400, "Email and password are required"));
  const userExist = await UserModel.findOne({ email }).select("+password");
  ```
- **Hardening:** Add `express-mongo-sanitize` globally; return constant "Invalid email or password" for both failure modes.

---

### F-13 — `verify-token` leaks internal claims; no FA/role re-check; relies on stale JWT
- **Severity:** MEDIUM
- **OWASP:** A07
- **Affected:** `Routers/Routers/user.Routes.ts:16-22`
- **Technical explanation:** Returns the whole `req.user` (including role) without re-validating against DB. If the user has been demoted or banned, JWT-only check leaves their privileges intact for up to 120 days.
- **Suggested fix:** Re-hydrate user from DB; ban check:
  ```ts
  r.get('/verify-token', userMiddleware, async (req, res, next) => {
    const u = await UserModel.findById(req.user!._id).select('_id role email status');
    if (!u || u.status === 'banned') return next(new ApiError(401, "Token invalid"));
    res.status(200).json({ success: true, message: "Token is valid", user: { _id: u._id, role: u.role, email: u.email }});
  });
  ```

---

### F-14 — `updateUserProfile`: email/phone takeover via case manipulation + missing self-check
- **Severity:** HIGH
- **OWASP:** A01
- **Affected:** `Services/user.Service.ts:563-727` (esp. 589-603)
- **Technical explanation:** When updating email, uniqueness check uses `email: email.trim()` (no `.toLowerCase()`), so `Victim@x.com` may pass uniqueness vs `victim@x.com`. After save, line 594 normalizes to lowercase — but the unique index in schema (`user.Schema.ts:21-25`) is on case-sensitive `email` without lowercase normalization. Result: duplicate users by casing OR ability to claim an email by adding case variant. Also no email re-verification — taking over a phone/email gives instant `forgotPassword` capability against the original owner.
- **Suggested fix:**
  ```ts
  if (email) {
    const normalized = email.trim().toLowerCase();
    if (normalized !== user.email) {
      const existing = await UserModel.findOne({ email: normalized });
      if (existing) return next(new ApiError(400, "Email already exists"));
      user.email = normalized;
      user.emailVerified = false; // trigger re-verification
    }
  }
  ```
  And add a `lowercase: true, index: { unique: true, collation: { locale:'en', strength: 2 } }` to schema.
- **Hardening:** Require OTP re-confirmation to change email/phone.

---

### F-15 — File upload: MIME-only validation, no magic-byte/extension check, no AV scan
- **Severity:** HIGH
- **OWASP:** A05 / A04
- **Affected:** `config/multer.ts:13-22`, `Services/user.Service.ts:107-122`, all `uploadImage.single(...)` callers
- **Technical explanation:** Multer's `mimetype` is the client-provided Content-Type — trivially spoofed. Sharp does some validation later, but Sharp will accept SVG-with-embedded-script and certain malformed images that exploit older `libwebp`/`libvips` CVEs (e.g. CVE-2023-4863, CVE-2023-5217). 10MB limit but no per-IP/upload-per-minute cap. No extension allowlist (a `.php` named file is fine because Cloudinary handles storage, but if the buffer ever lands on disk via `req.file.path`, RCE surfaces). Cloudinary upload happens server-side, so worst case is the Sharp `metadata()` decode of malicious WebP triggering native code execution.
- **Suggested fix:**
  ```ts
  // config/multer.ts
  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Invalid file type'));
    // Validate extension
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!['jpg','jpeg','png','webp','gif'].includes(ext)) return cb(new Error('Invalid extension'));
    cb(null, true);
  };
  ```
  In service code, verify magic bytes with `file-type` (already an option for Sharp):
  ```ts
  import { fileTypeFromBuffer } from 'file-type';
  const t = await fileTypeFromBuffer(req.file.buffer);
  if (!t || !['jpg','png','webp','gif'].includes(t.ext)) throw new ApiError(400, "Invalid image");
  ```
- **Hardening:** Pin Sharp ≥ latest patched (`0.34.x` is current but track CVEs); run Sharp in a separate worker thread with `node:worker_threads`; consider Cloudinary signed-upload from client to bypass server entirely; rate-limit uploads per user.

---

### F-16 — Reset password minimum length: 4 characters
- **Severity:** HIGH
- **OWASP:** A07
- **Affected:** `Services/user.Service.ts:331-333`
- **Technical explanation:** `if (password.length < 4)` — allows `1234`. Inconsistent with signup's `< 6` (which is itself too low).
- **Suggested fix:** Centralize policy:
  ```ts
  const MIN_PWD = 12;
  if (typeof password !== 'string' || password.length < MIN_PWD) {
    return next(new ApiError(400, `Password must be at least ${MIN_PWD} characters`));
  }
  ```
- **Hardening:** zxcvbn strength check; reject pwned passwords (HIBP k-anonymity).

---

### F-17 — Stack trace logging on every error (`console.log(err.stack)`)
- **Severity:** MEDIUM
- **OWASP:** A09:2021 Security Logging & Monitoring / A05
- **Affected:** `Middlewares/errorHandler.ts:17`
- **Technical explanation:** `console.log(err.stack)` writes full stacks to stdout. In production (Docker stdout → CloudWatch / Loki), this leaks internal file paths, ENV references, and library versions. Also no structured logging, no request-id correlation, no PII scrubbing.
- **Suggested fix:**
  ```ts
  export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    const statusCode = (err as any).statusCode || 500;
    const safeMessage = statusCode >= 500 ? 'Internal Server Error' : err.message;
    // Structured log (server-only)
    console.error(JSON.stringify({
      level: 'error', ts: new Date().toISOString(),
      reqId: (req as any).id, method: req.method, url: req.url,
      status: statusCode, msg: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    }));
    return res.status(statusCode).json({ success: false, statusCode, message: safeMessage });
  };
  ```
- **Hardening:** Use `pino` with redaction (`fcmToken`, `password`, `Authorization`); add request-id middleware.

---

### F-18 — Verbose logging of OTPs, internal keys, secrets in console
- **Severity:** HIGH
- **OWASP:** A09
- **Affected:** `Services/mail.Service.ts:50` (`console.log(\`📧 OTP generated for ${email}: ${otp}\`)`), `Middlewares/internalServiceAuth.ts:19-20` (commented but committed), `Services/user.Service.ts:454, 466-468, 484`, `Services/user.Service.ts:377-481` (Google login flow with token snippets), `App.ts:26` (`morgan('dev')` logs Authorization headers in dev format)
- **Technical explanation:** Logs OTPs and partial tokens to stdout — visible to anyone with log read access (developers, SRE, log aggregator). Comment-level leaks include the internal API key. `morgan('dev')` logs Authorization headers in some cases.
- **Suggested fix:**
  ```ts
  // mail.Service.ts:50 — remove the OTP value from log
  console.log(`OTP generated for ${email.replace(/(.).+(@.+)/,'$1***$2')}`);
  ```
  Replace `morgan('dev')` with `morgan('combined', { skip: () => process.env.NODE_ENV !== 'production' })` and a redaction stream.
- **Hardening:** Adopt `pino` with field-level redaction.

---

### F-19 — `INTERNAL_SERVICE_API_KEY` compared via `===` (non-constant time)
- **Severity:** MEDIUM
- **OWASP:** A02
- **Affected:** `Middlewares/internalServiceAuth.ts:33`, `Middlewares/CheckLoginMiddleware.ts:21`
- **Technical explanation:** Triple-equals string comparison leaks via timing differences. With network noise this is hard but not impossible.
- **Suggested fix:**
  ```ts
  import { timingSafeEqual } from 'node:crypto';
  const safeEq = (a: string, b: string) => {
    const ab = Buffer.from(a); const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  };
  if (!safeEq(String(apiKey), expectedKey)) { /* reject */ }
  ```

---

### F-20 — IDOR on `getUserLogs` (`req.params.userId`)
- **Severity:** HIGH
- **OWASP:** A01
- **Affected:** `Services/NotificationServices/notificationLogApi.Service.ts:283-299, 715-...`, route `Routers/Routers/notificationLog.Routes.ts` (review applicable wires)
- **Technical explanation:** Endpoint takes a userId from path with `authenticatedUserMiddleware` only — does not verify `req.user._id === userId` or admin role. Any logged-in user can read another's notification logs (PII, behavior pattern).
- **Suggested fix:**
  ```ts
  const { userId } = req.params;
  if (!userId || !mongoose.isValidObjectId(userId)) return next(new ApiError(400, "Valid user ID is required"));
  if (req.user!._id !== String(userId) && req.user!.role !== RoleIndex.ADMIN) {
    return next(new ApiError(403, "Forbidden"));
  }
  ```

---

### F-21 — `/categories/logs/*` exposed without auth
- **Severity:** HIGH
- **OWASP:** A01
- **Affected:** `Routers/Routers/category.Routes.ts:31-35`
- **Technical explanation:** `getDebugInfo`, `getAllLogs`, `getLogStats`, `getLogsByDateRange`, `getLogById` are mounted with NO middleware. The advertisement `getDebugInfo` (`advertisement.Routes.ts:16`) is similarly public.
- **Exploit:** `GET /api/v1/categories/logs` → all audit log entries (likely containing `createdBy`/`updatedBy` user IDs and timestamps).
- **Suggested fix:** Apply `adminMiddleware` to all `/logs/*` and `/debug` endpoints:
  ```ts
  r.get("/logs/debug", adminMiddleware, CategoryLogService.getDebugInfo);
  r.get("/logs", adminMiddleware, CategoryLogService.getAllLogs);
  ...
  r.get("/debug", adminMiddleware, AdvertisementService.getDebugInfo);
  ```

---

### F-22 — `clearAllCache` proxied through `flushAll` is callable in app code; no admin guard around cache clear
- **Severity:** MEDIUM
- **OWASP:** A01 / A04
- **Affected:** `Utils/cache.ts:86-95`, `Routers/Routers/featureFlag.Routes.ts:90-94` (guarded), `Services/featureFlag.Service.ts: clearCache`
- **Technical explanation:** `flushAll` is in the Redis safe-method allowlist (`config/redis.ts:34-57`). The feature-flag route is admin-guarded, but **any code path** can call `clearAllCache()` (no internal guard) which `flushAll`s the entire Redis instance — wiping queue, OTPs, sessions, distributed locks. Combined with header-spoof (F-01), a bad actor with internal key can call admin clearCache to drop OTP/reset-verified keys mid-flow and force re-auth chaos.
- **Suggested fix:** Restrict `flushAll` behind a feature flag and admin role check at the cache-util layer; rename clearCache route to require an explicit token.

---

### F-23 — Predictable cache key namespacing leaks user identity into key space
- **Severity:** MEDIUM
- **OWASP:** A04
- **Affected:** `Services/category.Service.ts:334-338`, `Services/item.Service.ts:847, 1013-1019, etc.`
- **Technical explanation:** Cache keys include `userId` in hashed form (`md5(...userId...)`). If two users have the same `viewedCategories` and search, they share a cache key — but here `userId` is in the hash input, so cross-user leakage is unlikely. However for `recently-viewed:${userId}` keys are unhashed — predictable, allows targeted invalidation by anyone able to call `redis.del` (only internal). Risk is low but the lack of namespace prefix per tenant means future multi-tenancy is fragile.
- **Suggested fix:** Always prefix with `tenant:env:` and use HMAC over (key + secret) when persisting any user data.

---

### F-24 — Open Redirect / SSRF: Cloudinary folder string from request path
- **Severity:** MEDIUM
- **OWASP:** A10:2021 SSRF
- **Affected:** `Services/user.Service.ts:629-632` (`folder: \`Epharma/profiles/${userId}\``)
- **Technical explanation:** `userId` comes from JWT (`req.user._id`) so direct injection is contained, but no validation that it's an ObjectId. If a JWT contains `_id: "../../../escape"` (possible if signing key leaks or via Google login path which uses `user.toObject()._id`), Cloudinary folder traversal could occur. The Cloudinary SDK escapes this internally, but defense in depth requires sanitization.
- **Suggested fix:**
  ```ts
  const safeUserId = mongoose.isValidObjectId(userId) ? userId : 'unknown';
  uploadToCloudinary(req.file.buffer, `Epharma/profiles/${safeUserId}`);
  ```

---

### F-25 — `googleAuthLogin`: blank password + auto-created accounts grant CUSTOMER role unconditionally
- **Severity:** MEDIUM
- **OWASP:** A07
- **Affected:** `Services/user.Service.ts:451-481`
- **Technical explanation:** When a new user is created via Google sign-in, `password: ""`. The schema (`user.Schema.ts:26-32`) only requires password when `provider === 'local'` — but the code never sets `provider`. Effectively bypasses the schema guard. The blank password means later `bcrypt.compare(plain, "")` returns false (safe), but the empty-password user can be acted on via `forgot-password` to set a *new* password and then login locally — a Google-authed user becomes vulnerable to email-takeover-driven local takeover. Additionally `fcmToken` is taken from body without verification.
- **Suggested fix:**
  ```ts
  user = await UserModel.create({
    name, email,
    provider: 'google',
    password: undefined,  // not "" so schema partial-index works
    phone: "",
    role: RoleIndex.CUSTOMER,
    lastLogin: new Date(),
    fcmToken: typeof fcmToken === 'string' ? fcmToken : '',
    emailVerified: true,
  });
  ```
  And in `forgotPassword`, refuse OTP for users with `provider === 'google'` until they explicitly set a local password.

---

### F-26 — Race condition: `findByIdAndUpdate` `$pull` + `$push` not atomic
- **Severity:** LOW
- **OWASP:** A04
- **Affected:** `Services/item.Service.ts:737-749, 793-805`
- **Technical explanation:** Two sequential awaits (`$pull` then `$push`). Concurrent requests can interleave, duplicating items. Low security impact; reliability concern.
- **Suggested fix:** Use a single atomic update with `$pull` + `$push` not possible together on same field; use `$pop` semantics or a transactional update.

---

### F-27 — Express body size limit 10 MB on every endpoint
- **Severity:** MEDIUM
- **OWASP:** A05 / A04
- **Affected:** `App.ts:18-19`
- **Technical explanation:** `express.json({ limit: '10mb' })` and `urlencoded({ limit:'10mb' })` apply globally. A 10MB JSON body sent to `/login` is parsed and dropped — easy DoS amplifier. Combine with `morgan('dev')` and you have an O(N) log write.
- **Suggested fix:** Per-route limits via separate router-level parsers:
  ```ts
  app.use(express.json({ limit: '100kb' }));      // global default
  // For prescription/upload routes that may receive base64:
  prescriptionRouter.use(express.json({ limit: '10mb' }));
  ```

---

### F-28 — No global rate limiting / brute-force protection
- **Severity:** HIGH
- **OWASP:** A04 / A07
- **Affected:** `App.ts` (no middleware), all `/users/*` routes
- **Technical explanation:** No `express-rate-limit`, no fail2ban, no captcha. `/login`, `/forgot-password`, `/verify-otp`, `/reset-password`, `/google-login`, `/notification-service/send` (after key leak) are all wide open.
- **Suggested fix (non-breaking; install `express-rate-limit`):**
  ```ts
  import rateLimit from 'express-rate-limit';
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000, max: 20,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success:false, statusCode:429, message:'Too many requests' }
  });
  r.post('/login', authLimiter, UserService.login);
  r.post('/forgot-password', authLimiter, UserService.forgotPassword);
  r.post('/verify-otp', authLimiter, UserService.verifyOtp);
  r.post('/reset-password', authLimiter, UserService.ResetPassword); // also remove userMiddleware (see F-03)
  r.post('/signup', authLimiter, uploadImage.single('profileImage'), UserService.signup);
  r.post('/google-login', authLimiter, UserService.googleAuthLogin);
  ```
- **Hardening:** Use Redis-backed limiter (`rate-limit-redis`) for cluster-safe counters; add slow-down (`express-slow-down`) on `/login` failures.

---

### F-29 — Missing Security Headers (no `helmet`)
- **Severity:** MEDIUM
- **OWASP:** A05
- **Affected:** `App.ts:15-26`
- **Technical explanation:** No `helmet`, no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Even a JSON API benefits from these because errors/HTML responses may render.
- **Suggested fix:**
  ```ts
  import helmet from 'helmet';
  app.use(helmet({
    contentSecurityPolicy: false, // pure API
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }));
  ```
  (add `helmet` to dependencies.)

---

### F-30 — `req.user._id` cast `as string` from JWT — no ObjectId validation
- **Severity:** MEDIUM
- **OWASP:** A03 / A04
- **Affected:** `Middlewares/CheckLoginMiddleware.ts:43-55, 75-78`
- **Technical explanation:** Header values and JWT decoded `_id` are passed downstream as bare strings into `findById` calls. Mongoose generally casts, but malformed objects fed via header injection (F-01) can crash queries or be reflected.
- **Suggested fix:**
  ```ts
  const userId = String(req.headers["x-user-id"] || "");
  if (!mongoose.isValidObjectId(userId)) return null;
  ```

---

### F-31 — `connectDB` does not throw — server boots without DB and silently exposes endpoints
- **Severity:** MEDIUM
- **OWASP:** A04
- **Affected:** `Databases/db.ts:43-46`, `App.ts:44-46`
- **Technical explanation:** On DB connect failure the code logs and continues. The server starts. Any auth attempts go to `UserModel.findOne` which hangs/buffers (Mongoose default buffering) or errors — potential DoS and incorrect 500 → 400 conflation.
- **Suggested fix:** In production, exit on DB failure (`process.exit(1)`); otherwise return 503 from `/health` until DB up.

---

### F-32 — Dockerfile: `bun install` includes devDeps; image bloat + larger CVE surface
- **Severity:** LOW
- **OWASP:** A06:2021 Vulnerable & Outdated Components
- **Affected:** `Dockerfile:17-18`
- **Technical explanation:** `bun install` (no `--production`) installs TypeScript, ESLint, etc. Increases attack surface and image size. Final runtime should not contain `tsx`, `@typescript-eslint/*`.
- **Suggested fix (multi-stage):**
  ```dockerfile
  FROM oven/bun:1 AS build
  WORKDIR /app
  COPY package.json bun.lock ./
  RUN bun install --frozen-lockfile
  COPY . .
  RUN bun run build

  FROM oven/bun:1-slim AS runtime
  RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
  WORKDIR /usr/src/app
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/package.json ./
  RUN bun install --frozen-lockfile --production
  USER bun
  EXPOSE 5001
  HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://127.0.0.1:5001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  CMD ["bun","run","dist/server.js"]
  ```
- **Hardening:** Pin base image by digest; run `bun audit` (or `npm audit` against `package-lock.json` if exists) in CI; integrate Trivy/Grype.

---

### F-33 — Dockerfile: `EXPOSE 5000` but app listens on `5001`
- **Severity:** LOW
- **OWASP:** A05
- **Affected:** `Dockerfile:32`, `server.ts:10`, `docker-compose.yml:7-8`
- **Technical explanation:** Mismatch indicates configuration drift; container health checks may pass on a misbehaving port. Not directly exploitable.
- **Suggested fix:** Standardize on one port. Use `ENV PORT=5001` in Dockerfile.

---

### F-34 — Cookie + secure flag inconsistency in dev/prod
- **Severity:** LOW (duplicate of F-07 surface) — Closed under F-07.

---

### F-35 — `/health` exposes Redis health internals
- **Severity:** LOW
- **OWASP:** A05
- **Affected:** `App.ts:28-38`
- **Technical explanation:** Returns degraded reason strings and `retryInMs`. Useful to attacker probing infra state.
- **Suggested fix:** Strip details from public response; expose verbose info on an internal-only route guarded by `internalServiceAuth` (after F-01 fix).

---

### F-36 — `morgan('dev')` always enabled
- **Severity:** LOW
- **OWASP:** A09
- **Affected:** `App.ts:26`
- **Suggested fix:**
  ```ts
  app.use(process.env.NODE_ENV === 'production' ? morgan('combined') : morgan('dev'));
  ```

---

### F-37 — Dependency hygiene: outdated/vulnerable libs
- **Severity:** MEDIUM
- **OWASP:** A06
- **Affected:** `package.json:1-62`
- **Concerns (review at audit time):**
  - `cloudinary@^1.41.3` — major version 1 is EOL; CVE history on legacy v1. v2 is the maintained line.
  - `multer@^2.0.2` — multer 2.x has had multiple `multipart` ReDoS / boundary-confusion advisories; track CVEs.
  - `node-mailjet@^6.0.11` — verify against advisory feed.
  - `nodemailer@^7.0.6` — known DKIM signature handling history; current line is OK but monitor.
  - `sharp@^0.34.5` — keep updated due to libvips/libwebp native CVEs.
  - `cookie-parser@^1.4.7`, `cors@^2.8.5` — fine but `cookie-parser` "secret" mode is unused; signed cookies recommended.
  - `bcryptjs@^3.0.2` — pure JS, slower than native `bcrypt`. Cost factor 10 (signup) and 10/12 inconsistent (`user.Service.ts:75, 353`). Standardize at 12 minimum.
  - `dotenv@^17.x` — verify; major bumps occasionally change behavior.
  - `firebase-admin@^13.x` — current major.
- **Suggested fix:** Add `bun audit` (or `npm audit`) to CI; upgrade Cloudinary to v2; pin minor versions; introduce Dependabot/Renovate.

---

### F-38 — `bcrypt` cost factor too low (10) and inconsistent (signup=10, reset=10, password change=?)
- **Severity:** MEDIUM
- **OWASP:** A02
- **Affected:** `Services/user.Service.ts:75-76, 353`
- **Suggested fix:**
  ```ts
  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  ```
- **Hardening:** Migrate to Argon2id (`argon2` package) at memory cost ≥ 64MB.

---

### F-39 — `clearRecentSearches` / `deleteRecentSearch` accept arbitrary `query` path param without ObjectId/length validation (RegExp injection risk)
- **Severity:** LOW
- **OWASP:** A03
- **Affected:** `Routers/Routers/item.Routes.ts:26`
- **Suggested fix:** Validate length and escape regex in service (when building filters).

---

### F-40 — Socket.IO `join:category` allows any auth user into any category room → broadcast hijacking
- **Severity:** LOW
- **OWASP:** A01
- **Affected:** `config/socket.ts:70-74`
- **Technical explanation:** A user joins `category:<id>` for any category. They then receive every other user's category-targeted update. PII low; impact low.
- **Suggested fix:** Validate `categoryId` is an ObjectId and corresponds to an existing category before join; consider read-only namespace.

---

### F-41 — DNS hardcoded to public resolvers (8.8.8.8 / 1.1.1.1) — DNS rebinding / poisoning risk if env is compromised
- **Severity:** LOW
- **OWASP:** A05
- **Affected:** `server.ts:6-8`
- **Technical explanation:** Forcing public DNS bypasses corporate DNS sinkholes / private resolvers and may MITM third-party calls (Mailjet, Cloudinary) if those resolvers are intercepted.
- **Suggested fix:** Make DNS servers configurable (`DNS_SERVERS` env), default to system resolver.

---

### F-42 — Unbounded queue enqueue path (no per-user / per-IP cap)
- **Severity:** MEDIUM
- **OWASP:** A04
- **Affected:** `Services/NotificationServices/notification.Service.ts:53-67, 109-117`, `Services/mail.Service.ts:192-254`
- **Technical explanation:** `/sendBulk` accepts arbitrary `userIds[]`. A leaked internal key (F-01) → unlimited bulk enqueue (spam abuse, Firebase quota burn). Similarly `send-bulk-notification` enumerates emails sequentially with 100ms delay but no per-call max length.
- **Suggested fix:**
  ```ts
  const MAX_BULK = 500;
  if (userIds.length > MAX_BULK) throw new ApiError(400, `Max ${MAX_BULK} users per request`);
  ```

---

## 4. OWASP TOP 10 (2021) MAPPING

| OWASP | Findings |
|------|---------|
| A01 Broken Access Control | F-01, F-03, F-06, F-08, F-14, F-20, F-21, F-22, F-40 |
| A02 Cryptographic Failures | F-04, F-05, F-09, F-19, F-38 |
| A03 Injection | F-11, F-12, F-30, F-39 |
| A04 Insecure Design | F-06, F-23, F-24, F-26, F-27, F-28, F-31, F-42 |
| A05 Security Misconfiguration | F-02, F-07, F-09, F-17, F-27, F-29, F-33, F-35, F-36, F-41 |
| A06 Vulnerable & Outdated Components | F-32, F-37 |
| A07 Identification & Authentication Failures | F-01, F-03, F-04, F-05, F-10, F-13, F-16, F-25, F-28 |
| A08 Software & Data Integrity Failures | F-15 (image), F-25 (account merge) |
| A09 Security Logging & Monitoring | F-17, F-18, F-36 |
| A10 Server-Side Request Forgery | F-24 (mild) |

---

## 5. PRIORITIZED REMEDIATION ROADMAP

### Week 0 — STOP-THE-BLEED (CRITICAL)
1. **F-06** Remove `role` from signup mass-assignment (1-line change). Deploy immediately.
2. **F-01** Restrict `extractUserFromHeaders` to trusted source IPs + apply only on `/notification-service`, `/mail-service`, `/feature-flags`. Rotate `INTERNAL_SERVICE_API_KEY` after deploy.
3. **F-03** Re-architect password reset (decouple from `userMiddleware`, bind opaque reset token to userId, see code in F-03).
4. **F-04** Move to `crypto.randomInt` + 6-digit OTP + attempt counter.
5. **F-05** Pin JWT algorithm, shorten TTL to ≤7d, validate secret length at boot.
6. **F-02** Replace `origin:'*'` with explicit allowlist.

### Week 1 — HIGH-PRIORITY HARDENING
7. **F-07** Cookie flags consistent (`secure`, `sameSite=strict`).
8. **F-08** Socket.IO origin allowlist + correct admin role string + drop fallback claim parsing.
9. **F-09** Re-enable MongoDB cert validation.
10. **F-10** Generic responses on `/forgot-password`.
11. **F-11, F-12** Add `express-mongo-sanitize` + regex escaping + string coercion.
12. **F-14** Email/phone normalization + uniqueness via case-insensitive index.
13. **F-15** Magic-byte validation, extension allowlist, Sharp ≥ patched.
14. **F-16** Raise reset-password min length to 12.
15. **F-20, F-21** Add admin/owner checks to all `*Logs.*` and `*Debug*` routes.
16. **F-28** Install `express-rate-limit` for all `/users/*` and high-risk endpoints.
17. **F-38** Standardize bcrypt cost at 12; or migrate to argon2.
18. **F-18** Remove OTP and token values from logs.

### Week 2 — MEDIUM
19. **F-13** Re-hydrate `req.user` from DB on `/verify-token`.
20. **F-17** Structured logging + redaction.
21. **F-19** `timingSafeEqual` everywhere API keys / signatures compared.
22. **F-22** Disable `flushAll` from app code paths.
23. **F-25** Set `provider='google'`; block local password reset for OAuth-only accounts.
24. **F-27** Per-route body-size limits.
25. **F-29** Add `helmet`.
26. **F-30** ObjectId validation at middleware.
27. **F-31** Boot-time DB connect failure → exit in production.
28. **F-32** Multi-stage Dockerfile, prod-only deps.
29. **F-37** Patch/track dependency CVEs; upgrade Cloudinary v1 → v2.
30. **F-42** Cap bulk endpoint sizes.

### Week 3+ — LOW & long-term
31. **F-23, F-26, F-33, F-35, F-36, F-39, F-40, F-41** — backlog.
32. Adopt a secrets manager (Vault / AWS SM / Doppler) — eliminate `.env` files in containers.
33. Move auth to short-lived access + refresh tokens with rotation.
34. Add audit log model (immutable, per-tenant) for all admin actions.
35. Integrate SAST (Semgrep) + DAST (ZAP) + dependency scanning into CI.

---

## 6. QUICK-WIN SAFE FIXES (NO API CONTRACT CHANGE)

These can be deployed in a single PR without touching frontend or third-party integrations.

1. **`App.ts:20-25`** — Replace `origin:['*']` with `origin: (process.env.CORS_ORIGINS||'').split(',')`.
2. **`App.ts:26`** — `morgan(process.env.NODE_ENV==='production'?'combined':'dev')`.
3. **`App.ts:18-19`** — Lower global JSON limit to `100kb`, opt-in higher on prescription router.
4. **`App.ts`** — `app.use(helmet({contentSecurityPolicy:false}))`.
5. **`config/multer.ts:13-22`** — Add extension allowlist (`['jpg','jpeg','png','webp','gif']`).
6. **`Utils/OtpGenerator.ts`** — Switch to `crypto.randomInt`, default length 6 (response shape unchanged; consumers already coerce).
7. **`Utils/jwtToken.ts`** — Add `algorithm:'HS256'` to sign; validate `USER_SECRET_KEY.length >= 32` at module load; reduce default expiry to `7d`.
8. **`Middlewares/CheckLoginMiddleware.ts:74`** — Add `algorithms:['HS256']` to `jwt.verify`.
9. **`Services/user.Service.ts:33,78-88`** — Drop `role` from destructured signup fields; force `role: RoleIndex.CUSTOMER`.
10. **`Services/user.Service.ts:215-220, 245-250`** — Replace inline cookie options with shared `cookieOpts` (see F-07).
11. **`Services/user.Service.ts:264-285`** — Make `/forgot-password` response uniform (`"If the email exists, an OTP has been sent"`); strip `provider`.
12. **`Services/user.Service.ts:331-333`** — Min password length 12.
13. **`Services/mail.Service.ts:50`** — Remove OTP value from log (`OTP generated for <maskedEmail>`).
14. **`Middlewares/internalServiceAuth.ts:33`** — Constant-time compare via `crypto.timingSafeEqual`.
15. **`Middlewares/errorHandler.ts:17-26`** — Hide stack + 500 message in production.
16. **`Routers/Routers/category.Routes.ts:31-35`** — Add `adminMiddleware` to all `/logs/*` and `/logs/debug`.
17. **`Routers/Routers/advertisement.Routes.ts:16`** — Add `adminMiddleware` to `/debug`.
18. **`Databases/db.ts:31-33`** — Set `tlsAllowInvalidCertificates: false`, `tlsAllowInvalidHostnames: false` (verify Atlas DNS first).
19. **`config/socket.ts:18-22`** — Restrict `origin` to env-driven allowlist; remove `decoded.id || decoded.userId || decoded.sub` — accept only `_id`.
20. **`config/socket.ts:61`** — Compare to `RoleIndex.ADMIN` (uppercase) instead of `'admin'`.
21. **`Services/item.Service.ts`** (filter builders) — Wrap each user-supplied search term with a 4-line `escapeRegex` helper.

Each of these is local, mechanical, preserves request/response JSON shapes, and addresses an OWASP A01–A09 weakness.

---

## APPENDIX A — KEY FILES INSPECTED

- `App.ts`, `server.ts`, `cleanExpoTokens.ts`
- `Routers/main.Routes.ts` + 11 routers under `Routers/Routers/*.Routes.ts`
- `Services/*.Service.ts`, `Services/NotificationServices/*`, `Services/PrescriptionService/*`
- `Middlewares/CheckLoginMiddleware.ts`, `errorHandler.ts`, `featureFlagMiddleware.ts`, `internalServiceAuth.ts`
- `Databases/db.ts`, `Databases/Schema/user.Schema.ts`
- `Utils/ApiError.ts`, `jwtToken.ts`, `cache.ts`, `cloudinaryUpload.ts`, `handleResponse.ts`, `mailer.ts`, `notification.ts`, `OtpGenerator.ts`, `Roles.enum.ts`, `serviceAccount.ts`, `catchAsyncErrors.ts`
- `config/multer.ts`, `redis.ts`, `socket.ts`
- `cronjob/queueProcessor.ts`, `Dockerfile`, `docker-compose.yml`, `docker-compose.local.yml`, `.env.docker`, `.gitignore`, `.dockerignore`, `package.json`

## APPENDIX B — RECOMMENDED ADDITIONAL CONTROLS

- **WAF** in front of the service (Cloudflare / AWS WAF) with rate rules.
- **Secrets manager** + secret rotation policy (no `.env` in containers).
- **mTLS** between Service 1 and Service 2 (replace static API key).
- **Audit log** persistence with WORM storage for admin actions.
- **SBOM** generation in CI (`bun pm pack` + cyclonedx) + Trivy scan.
- **Runtime protection**: drop Linux capabilities in Docker (`cap_drop: [ALL]`), set `read_only: true` filesystem, mount `tmpfs` for `/tmp`.

— End of audit —
