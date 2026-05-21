# Service 1 — Developer Onboarding Guide

> **Read time:** ~25 minutes  
> **Target audience:** New backend developers joining the team  
> **Goal:** Zero-to-productive on your first day — no Slack pings needed

---

## Table of Contents

1. [What is Service 1?](#1-what-is-service-1)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Local Development Setup](#4-local-development-setup)
5. [Environment Variables](#5-environment-variables)
6. [Running the Server](#6-running-the-server)
7. [Running Tests](#7-running-tests)
8. [Architecture Overview](#8-architecture-overview)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Complete API Reference](#10-complete-api-reference)
11. [Database Models](#11-database-models)
12. [Redis & Caching Strategy](#12-redis--caching-strategy)
13. [Background Jobs & Queue](#13-background-jobs--queue)
14. [Notification System](#14-notification-system)
15. [OCR / Prescription Flow](#15-ocr--prescription-flow)
16. [Error Handling Pattern](#16-error-handling-pattern)
17. [Validation Layer (Zod)](#17-validation-layer-zod)
18. [Coding Conventions](#18-coding-conventions)
19. [Security Model](#19-security-model)
20. [Docker & Deployment](#20-docker--deployment)
21. [Known Issues & Gotchas](#21-known-issues--gotchas)
22. [Useful Scripts & Commands](#22-useful-scripts--commands)

---

## 1. What is Service 1?

**Service 1** is the primary backend API for the **Velcart / e-Pharmacy** platform.  
It powers everything the mobile/web client sees:

| Domain | What it does |
|--------|-------------|
| **User Auth** | Signup, Login, Google OAuth, OTP-based password reset, refresh-token rotation |
| **Items / Products** | Listing, search, wishlist, deals-of-the-day, AI feed, recently-viewed |
| **Categories** | Hierarchical categories with images and view tracking |
| **Featured Medicines** | Admin-managed promoted medicine slots |
| **Advertisements** | Banner ads with targeting and logging |
| **Prescription OCR** | Upload prescription images → AI extracts medicine list |
| **Notifications** | FCM push, in-app socket, notification history |
| **Feature Flags** | Remote on/off switches for features without deployments |
| **Search** | Elasticsearch-powered product search |
| **Mail** | Transactional email (SendGrid + Nodemailer fallback) |

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | **Bun** | ≥ 1.x |
| Language | **TypeScript** | ~6.0 |
| HTTP Framework | **Express** | v5 |
| Database | **MongoDB** via Mongoose | ~8.x |
| Cache / Queue | **Redis** | v5 client |
| Real-time | **Socket.io** | v4 |
| Validation | **Zod** | v4 |
| Image Processing | **Sharp**, **Cloudinary** |  |
| OCR | **@development-team/bg-remover** (internal) |  |
| Push Notifications | **Firebase Admin SDK** |  |
| Email | **SendGrid** + Nodemailer fallback |  |
| Search | **Elasticsearch** |  |
| Auth | **JWT (HS256)** + opaque refresh tokens |  |
| Service Comms | **gRPC** (to Store service) |  |

> ⚠️ **Important:** The project uses **Bun** as runtime (not Node.js). Use `bun` commands, not `node` or `npx`. Tests also run via `bun test`.

---

## 3. Repository Structure

```
Service1 backend/
├── App.ts                    # Express app factory (middleware, CORS, routes)
├── server.ts                 # HTTP + Socket.io server boot, starts queue processor
│
├── Routers/
│   ├── main.Routes.ts        # Aggregates all sub-routers under /api/v1
│   └── Routers/              # One file per domain
│       ├── user.Routes.ts
│       ├── item.Routes.ts
│       ├── category.Routes.ts
│       ├── advertisement.Routes.ts
│       ├── featured.Routes.ts
│       ├── prescription.Routes.ts
│       ├── notification.Routes.ts
│       ├── notificationLog.Routes.ts
│       ├── featureFlag.Routes.ts
│       ├── features.Routes.ts
│       ├── search.Routes.ts
│       ├── mail.Routes.ts
│       └── bucket.Routes.ts
│
├── Services/                 # Business logic — one class per domain
│   ├── user.Service.ts
│   ├── item.Service.ts
│   ├── category.Service.ts
│   ├── advertisement.Service.ts
│   ├── featured.Service.ts
│   ├── featureFlag.Service.ts
│   ├── aggregation.service.ts
│   ├── search.service.ts
│   ├── bucket.service.ts
│   ├── mail.Service.ts
│   ├── NotificationServices/
│   │   ├── notification.Service.ts       # Send FCM push
│   │   ├── notificationLog.Service.ts    # Read/query notification history
│   │   ├── notificationLogApi.Service.ts # Public API layer
│   │   └── notificationQueue.Service.ts # Redis-backed queue
│   └── PrescriptionService/
│       ├── prescription.Service.ts  # Upload, history, SSE streaming
│       ├── ocr.Service.ts           # OCR result parser & medicine matcher
│       ├── medicine-matcher.ts      # Fuzzy name → DB product matching
│       └── medicine-worker.ts       # Worker thread for matching
│
├── Middlewares/
│   ├── CheckLoginMiddleware.ts   # JWT & gateway-mode auth (see §9)
│   ├── validateRequest.ts        # Zod validation HOF
│   ├── errorHandler.ts           # Global error handler
│   ├── featureFlagMiddleware.ts  # Per-route feature gating
│   ├── internalServiceAuth.ts    # x-internal-api-key guard
│   ├── ocrValidation.middleware.ts
│   └── LogMedillewares/          # Audit logging middlewares
│
├── Databases/
│   ├── db.ts                     # Mongoose connect
│   ├── Models/                   # 16 Mongoose models
│   │   └── index.ts              # Registers all models at boot
│   ├── Schema/                   # Raw schema definitions
│   └── Entities/                 # TypeScript interfaces
│
├── Utils/
│   ├── auth/                     # jwtToken, authCookies, OtpGenerator, Roles.enum
│   ├── errors/                   # ApiError, catchAsyncErrors
│   ├── responses/                # handleResponse
│   ├── cache/                    # cache, redisSafeWrapper, ttlChecker
│   ├── providers/                # mailer, notification, cloudinaryUpload, broadcastNotifications
│   ├── helpers/                  # aggregationUtils, bucket.utils, timerHelperFn
│   ├── misc/                     # serviceAccount, items-update.json
│   └── lib/
│       ├── proto/                # gRPC protocol buffer definitions
│       └── validators/           # Zod schemas per domain (e.g., _shared.ts)
│
├── config/
│   ├── .env                      # Real secrets — NEVER commit
│   ├── .env.example              # Template for production
│   ├── .env.local.example        # Template for local dev
│   ├── redis.ts                  # Redis client + circuit breaker + proxy
│   ├── socket.ts                 # Socket.io initialization
│   ├── cloudinary.ts
│   ├── elasticsearch.ts
│   └── multer.ts                 # File upload config
│
├── cronjob/
│   ├── keepAlive.ts              # Pings self to prevent cold starts (production)
│   └── queueProcessor.ts        # Polls Redis notification queue
│
├── tests/                        # Bun test files
│   ├── userService.auth.test.ts
│   ├── checkLoginMiddleware.test.ts
│   ├── jwtToken.test.ts
│   ├── validateRequest.test.ts
│   ├── category.Service.test.ts
│   ├── notificationQueue.test.ts
│   ├── ocr.Service.test.ts
│   └── userValidator.test.ts
│
├── docs/                         # Auto-generated docs & audit reports
├── proto/                        # gRPC proto definitions
└── scripts/                      # One-off ops scripts (seed flags, etc.)
```

---

## 4. Local Development Setup

### Prerequisites

| Tool | Min Version | Install |
|------|------------|---------|
| **Bun** | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Docker Desktop** | Any | [docker.com](https://docker.com) |
| **MongoDB** | Atlas account or local | Via docker-compose |
| **Redis** | 6+ | Via docker-compose |

### Step-by-step

```bash
# 1. Clone the repo
git clone <repo-url>
cd "Service1 backend"

# 2. Install dependencies
bun install

# 3. Copy and fill your local env file
cp config/.env.local.example config/.env
# Edit config/.env and add your secrets (see §5)

# 4. Start Redis (and optionally MongoDB) via Docker
docker compose -f docker-compose.local.yml up -d

# 5. Start the dev server with hot reload
bun run dev
```

The server starts at **`http://localhost:5001`** (or the port set in `.env`).

### Health check

```bash
curl http://localhost:5001/health
# → { "status": "OK", "service": "Service1", "redis": {...}, ... }

curl http://localhost:5001/api/v1/health
# → { "status": "OK", "uptime": 12.3, ... }
```

---

## 5. Environment Variables

All env files live in **`config/`**. The app loads `config/.env` at startup.

> ⚠️ `config/.env` is gitignored. **Never commit secrets.**

### Minimum required for local dev

```env
NODE_ENV=development
PORT=5001

# Auth — any random string locally
USER_SECRET_KEY=local-dev-secret-change-me
JWT_SECRET=local-dev-secret-change-me

# MongoDB — local or Atlas dev DB
MONGO_URI=mongodb://localhost:27017/e-pharmacy

# Redis — docker-compose service
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=svc1:local:

# Internal service key (for gateway-mode auth)
INTERNAL_SERVICE_API_KEY=local-dev-internal-key

# CORS — comma-separated, no wildcard in prod
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Full variable reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `PORT` | No | `5001` | HTTP server port |
| `MONGO_URI` | Yes | — | MongoDB connection URI |
| `MONGO_TLS_ALLOW_INVALID` | No | `false` | Only `true` for self-signed local TLS |
| `USER_SECRET_KEY` | Yes | — | JWT signing secret (HS256) |
| `JWT_SECRET` | Yes | — | Alias — used in some test helpers |
| `ACCESS_TOKEN_SECRET` | No | falls back to `USER_SECRET_KEY` | Prefer this for new setups |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `REDIS_CACHE_ENABLED` | No | `true` | Set `false` to run without Redis |
| `REDIS_KEY_PREFIX` | No | `` | Namespace prefix, e.g. `svc1:prod:` |
| `REDIS_COMMAND_TIMEOUT_MS` | No | `250` | Per-command Redis timeout |
| `REDIS_CIRCUIT_BREAKER_MS` | No | `60000` | Circuit breaker cooldown (ms) |
| `REDIS_DEFAULT_TTL_SECONDS` | No | `3600` | Default TTL when none specified |
| `INTERNAL_SERVICE_API_KEY` | Yes | — | Shared secret for service-to-service calls |
| `CORS_ORIGINS` | No | `*` (warns) | Comma-separated allowed origins |
| `FIREBASE_STRING` | No | — | Base64-encoded Firebase service account JSON |
| `GOOGLE_CLIENT_ID` | No | — | For Google OAuth login |
| `SENDGRID_API_KEY` | No | — | SendGrid email provider |
| `MAIL_FROM` | No | — | From address for transactional emails |
| `CLOUDINARY_CLOUD_NAME` | No | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | — | Cloudinary API secret |
| `ELASTICSEARCH_NODE` | No | — | Elasticsearch host URL |

---

## 6. Running the Server

```bash
# Development (hot reload)
bun run dev

# Production
bun run start

# Build TypeScript
bun run build
```

---

## 7. Running Tests

```bash
# Run all tests (sequential — important, tests share mocks)
bun test --concurrency=1

# Watch mode
bun run test:watch

# Run a specific file
bun test tests/jwtToken.test.ts
```

> **Why `--concurrency=1`?**  
> Tests use `spyOn` + `mock.restore()`. Parallel execution can cause spy collisions across files. Always run sequentially.

### Test files & what they cover

| File | Coverage |
|------|---------|
| `jwtToken.test.ts` | JWT sign/verify, alg:none rejection, HS512 confusion, TTL, refresh token uniqueness |
| `checkLoginMiddleware.test.ts` | Bearer priority, cookie fallback, gateway mode, expired/forged tokens, role checks |
| `userService.auth.test.ts` | Login happy path, wrong password, refresh rotation, reuse detection, logout |
| `validateRequest.test.ts` | Zod body/query/params validation, NoSQL injection, ObjectId validator |
| `category.Service.test.ts` | Category CRUD, cache miss/hit, log debug |
| `notificationQueue.test.ts` | Queue push/pop, Redis fallback |
| `ocr.Service.test.ts` | OCR result parsing |
| `userValidator.test.ts` | Schema field validation |

---

## 8. Architecture Overview

```
Client (Mobile / Web)
        │
        ▼
  [API Gateway]  ─── adds x-user-id, x-user-role, x-user-email headers
        │                    └── validated by x-internal-api-key
        │         OR direct JWT Bearer/Cookie (for dev/testing)
        ▼
┌─────────────────────────────────────┐
│           Service 1 (this repo)      │
│                                     │
│  Express App  ─→  Main Router       │
│       ↓              ↓              │
│  Middlewares     Sub-Routers        │
│  (Auth, Zod,     (per domain)       │
│   Feature Flag)      ↓              │
│                  Services           │
│                  (business logic)   │
│                      ↓              │
│              MongoDB + Redis        │
│              Cloudinary + FCM       │
│              Elasticsearch          │
│              gRPC → Store service   │
└─────────────────────────────────────┘
        │
        ▼
  Socket.io  (real-time notifications, OCR streaming)
```

### Request lifecycle

```
Request
  → cookieParser
  → express.json (10mb limit)
  → CORS
  → morgan (logging)
  → mainRouter (/api/v1/*)
      → sub-router
          → [auth middleware]        e.g. userMiddleware
          → [validateRequest(schema)]  Zod validation
          → Service handler
              → catchAsyncErrors wrapper
              → business logic (DB + Redis)
              → handleResponse(req, res, 200, "msg", data)
  → errorHandler (global catch-all)
```

---

## 9. Authentication & Authorization

### Two auth modes

#### Mode 1: Gateway Mode (production path)
The API gateway forwards user identity via headers **after** validating the original JWT:

```http
x-internal-api-key: <INTERNAL_SERVICE_API_KEY>   ← REQUIRED to trust headers
x-user-id: 507f1f77bcf86cd799439011
x-user-role: CUSTOMER
x-user-email: user@example.com
```

> ⚠️ Without a valid `x-internal-api-key`, identity headers are **completely ignored** (prevents spoofing).

#### Mode 2: Direct JWT Mode (testing / mobile clients)
Pass an `accessToken` in one of three ways (priority order):
1. `Authorization: Bearer <token>` — highest priority
2. Cookie: `accessToken=<token>`
3. Cookie: `userToken=<token>` — legacy fallback, back-compat only

### Token system

| Token | Type | TTL | Storage |
|-------|------|-----|---------|
| Access Token | JWT (HS256) | **15 minutes** | Cookie `accessToken` + `userToken` (legacy) |
| Refresh Token | 64-byte opaque hex (128 chars) | **60 days** | Cookie `refreshToken`, stored as SHA-256 hash in MongoDB |

### Refresh token flow

```
POST /api/v1/users/refresh-token
  Body: { refreshToken: "..." }  OR Cookie: refreshToken=...

Server:
  1. Hash presented token → lookup in RefreshTokenModel
  2. If revokedAt is set → THEFT DETECTED → revoke ALL user tokens → 401
  3. If expired → 401
  4. Issue new access + refresh pair
  5. Mark old row as revokedAt, link via replacedByHash
  6. Return new tokens + set cookies
```

### Role system

| Role | Access |
|------|--------|
| `CUSTOMER` | All customer-facing endpoints |
| `ADMIN` | Admin CRUD, feature flags, logs |
| `PHARMACIST` | (future use) |
| `UNKNOWN` | Assigned to Google Sign-In users without a phone/password |

### Auth middleware exports

```typescript
import {
  customersMiddleware,      // CUSTOMER only
  adminMiddleware,          // ADMIN only
  userMiddleware,           // CUSTOMER or ADMIN
  authenticatedUserMiddleware, // any authenticated user (any role)
  roleMiddleware,           // flexible: roleMiddleware('ADMIN', 'PHARMACIST')
} from './Middlewares/CheckLoginMiddleware';
```

After passing middleware, `req.user` is populated:
```typescript
req.user = { _id: string; role: string; email: string }
```

---

## 10. Complete API Reference

**Base URL:** `http://localhost:5001/api/v1`

All responses follow this envelope:
```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "statusCode": 400, "message": "Error detail" }
```

---

### 🔐 Users (`/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/verify-token` | userMiddleware | Validate token, returns req.user |
| `POST` | `/users/signup` | None | Register new CUSTOMER account |
| `POST` | `/users/login` | None | Email/password login |
| `POST` | `/users/refresh-token` | None (token IS credential) | Rotate access + refresh tokens |
| `POST` | `/users/logout` | userMiddleware | Revoke refresh token, clear cookies |
| `POST` | `/users/forgot-password` | None | Send OTP to email |
| `POST` | `/users/verify-otp` | None | Verify OTP → get reset permission |
| `POST` | `/users/reset-password` | userMiddleware | Reset password (OTP verified first) |
| `POST` | `/users/google-login` | None | Google ID token → issue app tokens |
| `GET` | `/users/profile` | userMiddleware | Get own profile |
| `PUT` | `/users/update/profile` | userMiddleware | Update profile (supports file upload) |

**Signup body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "phone": "9876543210",
  "age": 28,
  "dob": "1996-01-15",
  "fcmToken": "firebase-token",
  "address": {
    "street": "MG Road", "city": "Bangalore",
    "state": "Karnataka", "zip": "560001",
    "country": "India",
    "location": { "longitude": 77.59, "latitude": 12.97 }
  }
}
```

> ⚠️ **Security:** `role` field in signup body is **always ignored**. Self-signup always creates `CUSTOMER`. Role changes are admin-only on a separate endpoint.

---

### 💊 Items (`/items`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/items` | None | List all items (paginated, filters) |
| `GET` | `/items/category/:categoryId` | None | Items by category |
| `GET` | `/items/details/:itemId` | None | Single item detail |
| `GET` | `/items/similar/:itemId` | None | Similarity-scored related products |
| `GET` | `/items/deals-of-the-day` | None | Daily deals |
| `GET` | `/items/trending/AiPersonalized` | None | AI trending products |
| `GET` | `/items/GetItemFeed` | authenticatedUser | Personalized dynamic feed |
| `GET` | `/items/GetRecentlyViewedItems` | authenticatedUser | Recently viewed |
| `POST` | `/items/AddToRecentlyViewedItems` | authenticatedUser | Track viewed item |
| `GET` | `/items/wishlist` | authenticatedUser | Get wishlist |
| `DELETE` | `/items/wishlist/remove/:itemId` | authenticatedUser | Remove from wishlist |
| `GET` | `/items/wishlist/check/:itemId` | authenticatedUser | Is item in wishlist? |
| `DELETE` | `/items/wishlist/clear` | authenticatedUser | Clear entire wishlist |
| `GET` | `/items/search/suggestions` | None | Autocomplete suggestions |
| `GET` | `/items/search/popular-terms` | None | Popular search terms |
| `POST` | `/items/search/recent` | authenticatedUser | Save a recent search |
| `GET` | `/items/search/get-recent` | authenticatedUser | Get recent searches |
| `DELETE` | `/items/search/recent/:query` | authenticatedUser | Delete one recent search |
| `DELETE` | `/items/search/recent/clear` | authenticatedUser | Clear all recent searches |

**List items query params:**
```
?page=1&limit=20&category=xyz&search=paracetamol&sort=price&order=asc&inStock=true
```

---

### 🗂️ Categories (`/categories`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/categories` | None | All categories (simple list) |
| `GET` | `/categories/detailed` | None | Categories with item counts |
| `POST` | `/categories` | adminMiddleware | Create category |
| `PUT` | `/categories/:id` | adminMiddleware | Update category |
| `DELETE` | `/categories/:id` | adminMiddleware | Delete category |
| `GET` | `/categories/logs` | adminMiddleware | Category change audit log |

---

### 📢 Advertisements (`/advertisements`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/advertisements` | None | Get active ads |
| `POST` | `/advertisements` | adminMiddleware | Create ad |
| `PUT` | `/advertisements/:id` | adminMiddleware | Update ad |
| `DELETE` | `/advertisements/:id` | adminMiddleware | Delete ad |
| `GET` | `/advertisements/logs` | adminMiddleware | Ad change audit log |

---

### ⭐ Featured Medicines (`/featured-medicines`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/featured-medicines` | None | Get featured medicines |
| `POST` | `/featured-medicines` | adminMiddleware | Add to featured |
| `DELETE` | `/featured-medicines/:id` | adminMiddleware | Remove from featured |

---

### 📋 Prescriptions (`/prescriptions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/prescriptions/upload` | customersMiddleware | Upload image → JSON response (sync) |
| `POST` | `/prescriptions/upload-stream` | customersMiddleware | Upload image → SSE stream (async) |

**Upload body (multipart/form-data):**
```
prescription: <image file>   (JPEG/PNG/WebP, max 10MB)
pharmacyId: "optional-id"
```

**Upload flow:**
1. `multer` receives file into memory buffer
2. `optimizeImageForOcr` — Sharp resizes to max 1200px, converts to JPEG
3. `ocrMiddleware` — sends to OCR service, attaches result to `req`
4. `PrescriptionService.executeFallbackOcr` — parses result, matches medicines in DB

---

### 🔔 Notifications (`/notifications`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications` | userMiddleware | Get notification history |
| `GET` | `/notifications/:id` | userMiddleware | Get single notification |
| `PUT` | `/notifications/:id/read` | userMiddleware | Mark as read |
| `PUT` | `/notifications/read-all` | userMiddleware | Mark all as read |
| `DELETE` | `/notifications/:id` | userMiddleware | Delete notification |

---

### 📡 Notification Service (Internal) (`/notification-service`)

These endpoints are called **service-to-service** with `x-internal-api-key`. Not for direct client use.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/notification-service/send` | internalServiceAuth | Send push + log notification |
| `POST` | `/notification-service/broadcast` | internalServiceAuth | Broadcast to multiple users |

---

### 📧 Mail Service (Internal) (`/mail-service`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/mail-service/send` | internalServiceAuth | Send transactional email |

---

### 🚩 Feature Flags (`/feature-flags`, `/features`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/feature-flags` | adminMiddleware | List all flags |
| `POST` | `/feature-flags` | adminMiddleware | Create flag |
| `PUT` | `/feature-flags/:id` | adminMiddleware | Toggle / update flag |
| `DELETE` | `/feature-flags/:id` | adminMiddleware | Delete flag |
| `GET` | `/features` | userMiddleware | Get enabled features for current user |

---

### 🔍 Search (`/search`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/search?q=paracetamol` | None | Elasticsearch full-text search |

---

### 🪣 Bucket (`/bucket`)

Internal storage/aggregation operations (admin/service use).

---

## 11. Database Models

All models are registered at boot via `Databases/Models/index.ts`.  
**Never import a model without also importing the index** — or you'll get `MissingSchemaError`.

| Model | Collection | Description |
|-------|-----------|-------------|
| `UserModel` | `users` | Customer/admin accounts |
| `RefreshTokenModel` | `refreshtokens` | Opaque refresh tokens (hashed) |
| `ItemModel` | `items` | Products/medicines |
| `gstModel` | `gsts` | GST tax slabs |
| `CategoryModel` | `categories` | Product categories |
| `FeaturedMedicineModel` | `featuredmedicines` | Admin-promoted medicines |
| `AdvertisementModel` | `advertisements` | Banner ads |
| `FeatureFlagModel` | `featureflags` | Feature toggle flags |
| `NotificationLogModel` | `notificationlogs` | Notification history |
| `OcrHistoryModel` | `ocrhistories` | Past prescription OCR results |
| `PrescriptionModel` | `prescriptions` | Prescription upload records |
| `AggregatedResultModel` | `aggregatedresults` | Pre-computed aggregation cache |
| `AdvertisementLogModel` | `advertisementlogs` | Ad change audit |
| `CategoryLogModel` | `categorylogs` | Category change audit |
| `FeaturedLogModel` | `featuredlogs` | Featured change audit |

---

## 12. Redis & Caching Strategy

### Two Redis exports — know which one to use

| Export | File | Use for |
|--------|------|---------|
| `redis` | `config/redis.ts` | **All application code** — circuit-breaker protected, auto-prefixed, timeout-guarded |
| `rawRedis` | `config/redis.ts` | **Ops scripts only** — direct access, `flushAll` available |

### Cache helpers (use these, not raw Redis)

```typescript
import { getCache, setCache, deleteCache, deleteCachePattern } from './Utils/cache';

// Read (returns null on miss or Redis down)
const data = await getCache<MyType>('key');

// Write (TTL in seconds, default 3000s)
await setCache('key', data, 3600);

// Delete exact key
await deleteCache('key');

// Delete by pattern (uses SCAN, not KEYS)
await deleteCachePattern('categories:*');
```

### Cache-aside pattern (used everywhere)

```typescript
// Standard cache-aside pattern used in all services
const cached = await getCache<T>(cacheKey);
if (cached) return handleResponse(req, res, 200, 'msg', cached);

const fresh = await MyModel.find(...);
await setCache(cacheKey, fresh, 3600);
return handleResponse(req, res, 200, 'msg', fresh);
```

### Circuit breaker behavior

The Redis proxy has a built-in circuit breaker:
- If Redis times out or errors → circuit trips for **60 seconds** (configurable)
- During this window `isRedisAvailable()` returns `false` → all cache helpers return `null`/fallback
- App continues serving from MongoDB (degraded performance, correct data)
- Auto-reconnect runs every **15 seconds** in background

### OTP storage (direct Redis — no cache wrapper)

OTPs use raw Redis directly (intentional — no fallback wanted here):
```typescript
await redis.set(`otp:${user._id}`, otp, { EX: 180 });   // 3 min
await redis.set(`reset_verified:${user._id}`, "1", { EX: 600 }); // 10 min
```

---

## 13. Background Jobs & Queue

### Notification Queue (`cronjob/queueProcessor.ts`)

A Redis-backed queue shared with Service 2. Processes pending notifications:
- Started in `server.ts` after HTTP server boots
- Polls Redis list for queued notification jobs
- Calls FCM via `notification.ts` + logs to MongoDB

### Keep-Alive Cron (`cronjob/keepAlive.ts`)

- **Production only** — pings the service's own `/health` endpoint every N minutes
- Prevents cold starts on serverless/container platforms
- Only starts when `NODE_ENV === 'production'`

---

## 14. Notification System

Three delivery channels:

| Channel | When | How |
|---------|------|-----|
| **FCM Push** | Always (if fcmToken available) | Firebase Admin SDK |
| **Socket.io** | User is connected | `socketEmitters.ts` |
| **In-app** | Always | Saved to `NotificationLogModel` |

### Send a notification (from code)

```typescript
import { sendPushNotification } from './Utils/notification';

await sendPushNotification(
  fcmToken,
  'Title',
  'Body message',
  { type: 'order_update', orderId: '123' }   // extra data
);
```

### Broadcast notifications

```typescript
import { broadcastNotificationToUsers } from './Utils/broadcastNotifications';
// Sends to a list of userIds
```

---

## 15. OCR / Prescription Flow

```
POST /prescriptions/upload
        │
        ▼
  multer (memory storage)
        │
        ▼
  optimizeImageForOcr (Sharp)
  ├── Resize to max 1200px width
  └── Convert to JPEG @ 82% quality
        │
        ▼
  ocrMiddleware(@development-team/bg-remover)
  ├── Sends image to OCR microservice
  └── Attaches result to req.ocrResult
        │
        ▼
  PrescriptionService.executeFallbackOcr
  ├── Parses OCR text → extract medicine names
  ├── medicine-matcher.ts → fuzzy match against DB items
  └── Returns { medicines: [...], confidence: 0.87, ... }
```

**Streaming variant** (`/upload-stream`):
- SSE (Server-Sent Events) for real-time progress
- `streamInterceptorMiddleware` intercepts OCR stream and emits via Socket.io
- Client receives partial results as OCR processes

---

## 16. Error Handling Pattern

### Throwing errors in services

```typescript
// Always use ApiError — never throw raw Error objects
import { ApiError } from '../Utils/ApiError';

return next(new ApiError(404, 'Item not found'));
return next(new ApiError(400, 'Email already exists'));
return next(new ApiError(401, 'Unauthorized: Please login first'));
return next(new ApiError(403, 'Forbidden: Admin access required'));
```

### Wrapping async handlers

```typescript
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';

// Wrap ALL async service methods — this sends uncaught errors to next()
public static myHandler = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    // your logic
    return handleResponse(req, res, 200, 'Success', data);
  }
);
```

### Global error handler

Lives in `Middlewares/errorHandler.ts`. It catches everything forwarded to `next(err)`:
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Item not found"
}
```

> Stack traces are logged to console (not sent to client).

---

## 17. Validation Layer (Zod)

### Using `validateRequest` middleware

```typescript
import { validateRequest } from '../Middlewares/validateRequest';

// In a route file:
router.post(
  '/signup',
  validateRequest({ body: signupSchema }),  // validates + sanitizes req.body
  UserService.signup
);

// Can validate body, query, and params simultaneously:
router.get(
  '/items',
  validateRequest({
    query: listItemsQuerySchema,
    params: itemParamsSchema,
  }),
  ItemService.getAllItems
);
```

### Writing validators

```typescript
import { z, zodObjectId, safeString, passthroughObjectNoOperators } from './_shared';

export const mySchema = z.object({
  id: zodObjectId('Item ID'),          // validates MongoDB ObjectId + rejects objects
  email: safeString('email').email(),  // string + NoSQL-injection safe
  page: z.string().optional(),
}).passthrough(); // allow unknown fields (use .strict() to reject them)
```

### Security validators in `_shared.ts`

| Helper | Purpose |
|--------|---------|
| `zodObjectId(label)` | Validates 24-char hex ObjectId, rejects objects |
| `safeString(label)` | String that rejects object inputs (NoSQL vector) |
| `noOperatorKeys(val)` | Rejects objects with `$`-prefixed keys |
| `passthroughObjectNoOperators` | Flexible body that still rejects `$set`, `$ne`, etc. |
| `stringBool` | Accepts `true`/`false` or the strings `"true"`/`"false"` |
| `positiveIntString` | Accepts integer or digit string (for pagination) |

---

## 18. Coding Conventions

### File naming

| Type | Convention | Example |
|------|-----------|---------|
| Service | `name.Service.ts` | `user.Service.ts` |
| Router | `name.Routes.ts` | `user.Routes.ts` |
| Model | `name.model.ts` / `name.Models.ts` | `user.Models.ts` |
| Validator | `name.Validator.ts` | `user.Validator.ts` |
| Util | `camelCase.ts` | `jwtToken.ts` |

### Service class pattern

All business logic lives in **static methods** on a class:

```typescript
export default class UserService {
  // Private helpers
  private static async issueTokensForUser(...) { ... }

  // Public handlers — always wrapped in catchAsyncErrors
  public static login = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      // 1. Extract from req.body (already validated by Zod)
      // 2. Business logic
      // 3. Return handleResponse(req, res, 200, 'message', data)
      //    OR next(new ApiError(400, 'error'))
    }
  );
}
```

### Response format

Always use `handleResponse` — **never** call `res.json()` directly in services:

```typescript
import { handleResponse } from '../Utils/handleResponse';
return handleResponse(req, res, 200, 'User fetched successfully', userData);
```

### Cache key conventions

```
categories:simple          → simple category list
categories:list:<page>     → paginated categories
items:all:<page>:<filters> → item listing
item:<id>                  → single item
otp:<userId>               → OTP (TTL: 3 min)
reset_verified:<userId>    → OTP verified flag (TTL: 10 min)
```

---

## 19. Security Model

### Authentication security
- JWT algorithm pinned to **HS256** — `alg:none` and algorithm-confusion attacks rejected at `verifyAccessToken`
- Access tokens: **15 minute TTL** (not the old 120 days)
- Refresh tokens: **opaque 64-byte random hex**, stored as SHA-256 hash in DB
- **Reuse detection**: if a revoked refresh token is replayed → all user sessions nuked

### Authorization security
- `role` is **never accepted from req.body** during self-signup (forced to `CUSTOMER`)
- Gateway identity headers only trusted when `x-internal-api-key` is valid
- Identity headers (`x-user-id`, `x-user-role`) are stripped from CORS `allowedHeaders` (browsers can't set them)

### Input security
- All routes validated via Zod — no raw `req.body` access in services for new routes
- `zodObjectId` rejects object inputs (NoSQL injection `{$ne: ""}`)
- `passthroughObjectNoOperators` rejects `$`-prefixed keys on flexible schemas
- Email always normalized: `email.toLowerCase().trim()` before DB queries

### Data security
- Passwords: bcrypt salt rounds = **10**
- TLS certificate validation **enabled** for MongoDB Atlas (opt-out via `MONGO_TLS_ALLOW_INVALID=true` only for local self-signed)
- Profile images: always uploaded to Cloudinary, never served from our servers

### Cookie security
- All auth cookies: `httpOnly: true`, `sameSite: 'lax'`
- `secure: true` in production only (allows local dev over HTTP)
- `refreshToken` cookie scoped to `path: '/api/v1/users'` (limits exposure)

---

## 20. Docker & Deployment

### Local Docker (development)

```bash
# Start Redis only (recommended for local dev)
bun run db:up

# Start full stack (app + redis)
docker compose -f docker-compose.local.yml up -d

# Logs
docker compose -f docker-compose.local.yml logs -f
```

### Production Docker

```bash
# Build image
bun run docker:build

# Run
bun run docker:run

# Full compose up
bun run docker:up

# Logs
bun run docker:logs
```

### Dockerfile notes
- Multi-stage build (build → prod image)
- Bun runtime in container
- Exposes port `5000` (production default)
- Reads `config/.env` inside container (inject via `-v` or env vars)

---

## 21. Known Issues & Gotchas

> These are things you **will** hit if you don't read this first.

### 🔴 CRITICAL — Fixed on this branch
1. **Git merge conflict in `Databases/Models/index.ts`** — **RESOLVED** ✅  
   Both branches' models (`RefreshTokenModel` AND `OcrHistoryModel`, `PrescriptionModel`, `AggregatedResultModel`) are now imported.

2. **Git merge conflict in `Routers/Routers/prescription.Routes.ts`** — **RESOLVED** ✅  
   HEAD version (with Zod `validateRequest`) was kept as the authoritative version.

---

### ⚠️ Important gotchas

3. **`dotenv.config()` called in multiple files**  
   `App.ts`, `CheckLoginMiddleware.ts`, `jwtToken.ts`, `db.ts`, etc. all call `dotenv.config({ path: './config/.env' })`.  
   This is safe (idempotent) but means the CWD must be the project root when the server starts.

4. **`catchAsyncErrors` doesn't return a Promise**  
   The wrapper calls `handler(...).catch(next)` internally and returns `void`. In tests, you can't `await UserService.login(...)` — use the `runHandler` helper from `userService.auth.test.ts`.

5. **Redis `clearAllCache()` is disabled**  
   Calling `clearAllCache()` from `Utils/cache.ts` is a **no-op** by design. Use `deleteCachePattern('prefix:*')` or the ops runbook (`docs/REDIS_OPS.md`).

6. **`redis.flushAll()` is blocked on the public proxy**  
   The `redis` export proxies `flushAll` to a warning + BLOCKED. Use `rawRedis.flushAll()` only from ops scripts.

7. **Google Sign-In users get `role: UNKNOWN`** if their account is created fresh. The frontend should prompt them to complete their profile.

8. **`CORS_ORIGINS` must be set in production**  
   Without it, the backend warns and falls back to wildcard `*`, which **breaks cookie-based auth cross-origin** (browsers reject credentials with wildcard origin).

9. **`userToken` cookie is a legacy alias of `accessToken`**  
   It's `secure: false` even in production. This is intentional for old frontend builds. Once all clients are updated, remove it.

10. **Elasticsearch is optional** — if not configured, the search endpoint will error. Other features are unaffected.

11. **Firebase is optional** — if `FIREBASE_STRING` is missing, FCM push silently fails. Other auth flows are unaffected.

12. **`mongoose.isValidObjectId('')` returns `true`** for empty string in some versions. Always use `zodObjectId()` in validators which has an explicit length check.

---

## 22. Useful Scripts & Commands

```bash
# Development
bun run dev                          # Start with hot reload
bun run start                        # Start without hot reload (production)

# Testing
bun test --concurrency=1             # Run all tests
bun test tests/jwtToken.test.ts      # Run one file
bun run test:watch                   # Watch mode

# Docker
bun run db:up                        # Start Redis only
bun run docker:up                    # Full docker compose up
bun run docker:down                  # Stop all containers
bun run docker:logs                  # Tail container logs
bun run docker:build                 # Build Docker image

# Seeding
bun run seed:flags                   # Seed default feature flags

# Type checking
bun run build                        # TypeScript compile check

# Lint
npx eslint .                         # Run ESLint

# Quick health check
curl http://localhost:5001/health
curl http://localhost:5001/api/v1/health
```

---

## Quick Reference Card

```
Auth tokens:      accessToken (JWT, 15m) + refreshToken (opaque, 60d)
Cookie path:      refreshToken → /api/v1/users  |  accessToken → /
Roles:            CUSTOMER | ADMIN | PHARMACIST | UNKNOWN
Error class:      new ApiError(statusCode, message) → next(err)
Response:         handleResponse(req, res, 200, 'msg', data)
Async safety:     catchAsyncErrors(async (req, res, next) => { ... })
Validation:       validateRequest({ body: schema, query: schema, params: schema })
Cache:            getCache / setCache / deleteCache / deleteCachePattern
Redis safety:     redis.get() never throws — returns null on failure
Test runner:      bun test --concurrency=1
Env location:     config/.env  (gitignored, copy from config/.env.local.example)
```

---

*Last updated: May 2026 | Maintained by the backend team*  
*For questions, check `docs/` folder or ask in #backend-dev Slack channel.*
