# Service1 Backend — Hardening Session (May 2026)

End-to-end audit + remediation pass: security, performance, validation, infra,
test stability. All changes preserve existing API request / response shapes.

---

## 1. Audits (already in `docs/audit-2026-05/`)

| Report | Findings |
|---|---|
| `SECURITY_AUDIT.md` | 42 (9 CRITICAL, 14 HIGH) — auth, RBAC, NoSQL, OWASP Top 10 |
| `PERFORMANCE_AUDIT.md` | 47 (7 CRITICAL, 17 HIGH) — indexes, hot loops, cache anti-patterns |
| `QA_ARCHITECTURE_AUDIT.md` | pending (retry agent still running) |

---

## 2. Security fixes (already committed in `60d99de`, recapped here)

| ID | Title | Files |
|---|---|---|
| F-03 | Password reset bypass — enforce `req.user.email === req.body.email`, raised min length to 8 | `Services/user.Service.ts` |
| F-04 | OTP — `crypto.randomInt` (CSPRNG) + 6-digit default (was Math.random + 4-digit) | `Utils/OtpGenerator.ts` |
| F-06 | Signup mass-assignment — `role` no longer destructured from body; forced `CUSTOMER` | `Services/user.Service.ts` |
| F-08 | Socket.IO — env-driven CORS allowlist, JWT algorithm pinned via `verifyAccessToken`, drop fallback claim parsing, fix admin role string (uppercase) | `config/socket.ts` |
| F-09 | MongoDB TLS validation — env-gated, defaults to **strict** | `Databases/db.ts` |
| F-CORS | CORS `allowedHeaders` — dropped `x-user-id` / `x-user-role` / `x-user-email` / `x-internal-api-key` from browser-visible list | `App.ts` |
| Latent | `getCategoryById` — `$match` cast string → `ObjectId` | `Services/category.Service.ts` |

### Refresh + Access Token system (already committed)
- Access token: 15-min HS256 JWT (algorithm pinned on verify).
- Refresh token: 64-byte opaque, stored as SHA-256 hash with TTL + rotation chain.
- Theft detection: reusing a revoked refresh token invalidates ALL of that user's refresh tokens.
- Backward compatible: response keeps `token` field aliased to `accessToken`.
- Files: `Utils/jwtToken.ts`, `Utils/authCookies.ts`, `Databases/Models/refreshToken.Model.ts`, `Databases/Schema/refreshToken.Schema.ts`, `Databases/Entities/refreshToken.Interface.ts`, `Services/user.Service.ts`, `Middlewares/CheckLoginMiddleware.ts`, `Routers/Routers/user.Routes.ts`.
- Frontend integration guide: `docs/FRONTEND_CHANGES.md`.
- Tests: `tests/jwtToken.test.ts`, `tests/checkLoginMiddleware.test.ts`, `tests/userService.auth.test.ts`, manual plan: `tests/REFRESH_TOKEN_MANUAL_TESTS.md`.

### Deployment fix (already committed)
- TS path aliases (`@services/`, `@utils/`, etc.) caused `MODULE_NOT_FOUND` after `tsc` compile.
- All 7 alias-using files converted to relative imports.
- Dockerfile switched to run TS directly via Bun (`bun run server.ts`) — Bun resolves tsconfig paths natively. Compile step removed; image smaller, startup faster, dev/prod parity.
- Healthcheck added that does NOT depend on Redis (graceful degradation preserved).

---

## 3. THIS COMMIT WAVE — uncommitted work pushed in this session

### 3.1 Redis hardening + local/prod split + memory management

**Why:** Production Redis kept filling up; same connection string was used for local + prod with no isolation; `flushAll` exposed via proxy was an operational footgun.

| File | Change |
|---|---|
| `config/redis.ts` | Removed `flushAll` from safe-method set; added `MAX_CACHE_KEY_LENGTH` (256) and `MAX_CACHE_VALUE_BYTES` (env-overridable, default 512 KB) guards; **auto-injects default TTL** (env `REDIS_DEFAULT_TTL_SECONDS`, default 3600s) when `set()` is called without `EX`/`PX` — Redis can no longer accumulate eternal keys; `REDIS_KEY_PREFIX` env auto-prefixes every key (local vs prod isolation); idempotent `connectRedis()`; exported `markRedisDegraded()` + `getRedisStats()` + `rawRedis`; added `sAdd`/`sRem`/`sMembers`/`sIsMember` to safe surface (used by notification queue). |
| `Utils/cache.ts` | Same public signatures (`getCache` / `setCache(key, value, ttl=3000)` / `deleteCache` / `deleteCachePattern`); added key/value guards; on `JSON.parse` failure → `markRedisDegraded` + drop key; `clearAllCache` neutered to log-only (no flushAll). |
| `docker-compose.yml` | Pinned `redis:7.4-alpine`; command set to `--maxmemory 256mb --maxmemory-policy allkeys-lru --save "" --appendonly no`; `redis-cli ping` healthcheck; injected `REDIS_KEY_PREFIX=svc1:local:`; removed persistent volume (ephemeral local cache). |
| `docker-compose.local.yml` | Same `maxmemory` + LRU policy + healthcheck. |
| `Dockerfile` | Final polish — Bun image pinned `oven/bun:1.1-debian`, `EXPOSE 5001` aligned, healthcheck via `fetch()` (no Redis dep). |
| `config/.env.example` | **Simplified**. Production / global only — minimal essentials. |
| `config/.env.local.example` | **New**. Docker-local dev — minimal essentials with sane defaults. |
| `docs/REDIS_OPS.md` | New ops doc — local vs prod split, full cache-key inventory (30 keys, 6 GREEN / 20 AMBER / 4 RED), TTL conventions, eviction policy explanation, "Redis is down — what happens" runbook, memory-bloat troubleshooting checklist. |

**Net effect on production:**
- Redis can be completely down — backend continues serving requests with `db_fallback` cache mode.
- Redis cannot fill up uncapped — eviction (`allkeys-lru`) + size caps + default-TTL guarantee bounded growth.
- Local Docker Redis and production global Redis are isolated by key prefix.

### 3.2 Zod validation layer

**Why:** No central input validation. NoSQL operator injection possible (e.g. `{"email": {"$ne": ""}}`). ObjectId params not validated.

| File | Change |
|---|---|
| `Middlewares/validateRequest.ts` | **New**. Higher-order middleware: `validateRequest({ body?, query?, params? })`. Uses `safeParse`, mutates `req.body/query/params` to parsed values, forwards `new ApiError(400, msg)` so the existing `errorHandler` produces the project's standard envelope. |
| `Validators/_shared.ts` | **New**. Reusable helpers: `zodObjectId()`, `noOperatorKeys()`, `safeString()`, `passthroughObjectNoOperators()`. |
| `Validators/user.Validator.ts` | **New**. 9 schemas — signup, login, googleLogin, forgotPassword, verifyOtp, resetPassword, updateProfile, refreshToken, logout. |
| `Validators/category.Validator.ts` | **New**. 10 schemas. |
| `Validators/item.Validator.ts` | **New**. 12 schemas. |
| `Validators/advertisement.Validator.ts` | **New**. 6 schemas. |
| `Validators/featured.Validator.ts` | **New**. 5 schemas. |
| `Validators/featureFlag.Validator.ts` | **New**. 4 schemas. |
| `Validators/features.Validator.ts` | **New**. 1 schema. |
| `Validators/notification.Validator.ts` | **New**. 5 schemas. |
| `Validators/notificationLog.Validator.ts` | **New**. 6 schemas. |
| `Validators/prescription.Validator.ts` | **New**. 1 schema. |
| `Validators/mail.Validator.ts` | **New**. 3 schemas. |
| `Routers/Routers/*.Routes.ts` (×11) | Wired `validateRequest(...)` into each route. ONE-LINE additions only. No path/method/order changes. |
| `package.json` + `bun.lock` | `zod@4.4.3` added. |
| `tests/validateRequest.test.ts` | **New**. 11 cases — body/query/params validation, NoSQL injection rejection, ObjectId helper, strict vs passthrough. |
| `tests/userValidator.test.ts` | **New**. 15 cases — signup/login schema shapes. |

**Permissive-but-safe routes** (closed `$`-key injection only, schemas still passthrough by design): `PUT /category/:id`, `PUT /advertisement/update/:adId`, `PUT /featured/:id`, `PUT /feature-flags/:key`, `PUT /user/update/profile`, `POST /prescription/upload[-stream]`, all admin log/stats listing endpoints.

### 3.3 MongoDB indexes (20+ added)

**Why:** Schemas had ZERO secondary indexes. Every query was a collection scan.

| Collection | Indexes added |
|---|---|
| `items` | 9 — compound (category+createdAt+active), text (`itemName`/`itemCompany`/`formula`/`code`), trending sort, similarity |
| `users` | 3 — `fcmToken` partial-where-not-null, compound `provider+email`, `role+createdAt` |
| `categories` | 2 — `isActive+priority`, `code` |
| `advertisements` | 3 — `isActive+priority`, click-tracking, expiry |
| `featuredmedicines` | 3 — `featured+isActive`, `category`, `priority` |
| `refreshtokens` | already had `tokenHash` unique + `expiresAt` TTL + `{userId, revokedAt}` — verified, no change |
| `notificationlogs` | already had recommended — verified, no change |

Every index declared via `schema.index(...)` with a `// PERF-AUDIT-2026-05: <finding-id>` comment.

### 3.4 Performance quick-wins (12+ applied)

| File:line | Fix |
|---|---|
| `Services/item.Service.ts:617` | Removed cache-killing `redis.del(cacheKey)` in `getDealsOfTheDay`, added cache-hit short-circuit. |
| `Services/item.Service.ts:737, :798` | Combined `$pull`+`$push` into one aggregation-pipeline `updateOne`; wishlist capped at 500. |
| `Services/item.Service.ts:752, :1518` | Variadic `redis.del(keys)` (was `Promise.all(map(del))`). |
| `Services/item.Service.ts:185` | `getAllItems` `$lookup` moved inside `$facet.items` after `$skip/$limit`. |
| `Services/advertisement.Service.ts:707` | `trackClick` uses `$push` + `$slice:-1000` instead of full doc `.save()`; folds 3 `findById`s into one `$in`. |
| `Services/advertisement.Service.ts:594` | `getActiveAds` sortBy whitelist + parallel count/find. |
| `Services/{category,advertisement,featured}.Service.ts` (6 sites) | Replaced `User.find({fcmToken:{$ne:null}})` broadcast-to-all with cursor-streamed `broadcastToAllUsersWithLog`. |
| `Utils/notification.ts:149` | `sendBulkNotifications` chunked at 50 tokens/wave. |
| `Utils/broadcastNotifications.ts` | **New**. Cursor-streamed fan-out helper. |
| `Services/NotificationServices/notificationQueue.Service.ts:144` | Removed `sleep(100)` per item; `:249` added `.lean()`. |
| `Services/NotificationServices/notificationLog.Service.ts:95, :351` | Pushed `isActive`/`featured` filter inside each `$lookup` sub-pipeline (`let`+`$expr`); added additive keyset cursor on `getUserLogs` (`?cursor=<ISO>`). |
| `Services/mail.Service.ts` | `.lean()` on read-only `findOne` queries. |
| `cronjob/queueProcessor.ts` | Overlap guard (`tickInFlight`), 60-s `Promise.race` timeout, 5-min `recoverStuckProcessing` interval. |
| Dead code | ~100 lines of commented-out alternate `getItemsByCategory` block removed (SAFE-tagged only). |

### 3.5 Test stability

| File | Change |
|---|---|
| `package.json` | `test` script switched to `bun test --concurrency=1` to avoid cross-file mock-leak timeouts. |

**Final result:** `bun test` → **69 pass, 0 fail** in ~1.5s.

---

## 4. What is intentionally NOT in this wave (follow-ups)

- **No new heavy deps** (helmet / express-rate-limit / express-mongo-sanitize) — zod handles input validation; rate-limit will go via a dedicated `ratelimit:<id>` Redis-token-bucket middleware in a follow-up PR. Avoided to keep blast radius small.
- **Dockerfile multi-stage** — perf audit flagged it Medium-risk; left for a deliberate rollout (prior path-alias breakage history).
- **Pagination helper centralization** — P2 refactor, touches many call sites, skipped for now.
- **View-count Redis INCR migration** — out of P1 quick-win scope (would require a flusher job).
- **Folder structure rename** (`Routers/Routers/` → `Routers/`, `LogMedillewares` typo) — would touch every import in the repo; deferred.

---

## 5. Verification

- `bun test` → **69/69 pass** (43 auth/middleware + 26 zod) in 1.52s.
- Smoke import all critical files (App.ts, jwtToken, authCookies, validateRequest, redis, socket, user/category/item/advertisement/featured services, notification queue): **OK**.
- `bun -e "import('./Databases/Models/index.ts')"` → **OK**.
- MongoDB + Firebase + Redis all connect successfully at boot.

---

## 6. Files touched in this commit wave

**Modified (33):**
`Databases/Schema/{Category,advertisement,featuredMedicine,items,user}.Schema.ts`, `Dockerfile`, `Routers/Routers/*.Routes.ts` (×11), `Services/{advertisement,category,featured,item,mail}.Service.ts`, `Services/NotificationServices/{notificationLog,notificationQueue}.Service.ts`, `Utils/{cache,notification}.ts`, `bun.lock`, `config/redis.ts`, `cronjob/queueProcessor.ts`, `docker-compose.yml`, `docker-compose.local.yml`, `package.json`.

**Created (20):**
`Middlewares/validateRequest.ts`, `Utils/broadcastNotifications.ts`, `Validators/_shared.ts` + 11 per-router validators, `config/.env.example`, `config/.env.local.example`, `docs/REDIS_OPS.md`, `docs/SESSION_CHANGES.md` (this file), `tests/userValidator.test.ts`, `tests/validateRequest.test.ts`.
