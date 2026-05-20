# Redis Operations — Service 1

> Goal: backend keeps working even when Redis is completely down. Redis is a
> performance accelerator, not a hard dependency. This doc is the single
> source of truth for cache keys, TTLs, and incident response.

---

## 1. Local vs Production Redis

| Aspect              | Local (docker-compose)                            | Production (managed global)                                |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Where defined       | `docker-compose.yml`, `docker-compose.local.yml`  | Deployed env (CI/CD secret store)                          |
| `REDIS_URL`         | `redis://redis:6379`                              | `rediss://default:<pw>@<host>:<port>?tls=true`             |
| `REDIS_KEY_PREFIX`  | `svc1:local:`                                     | `svc1:prod:` (recommended)                                 |
| Persistence         | None (`--save "" --appendonly no`)                | Provider-managed (RDB/AOF as configured)                   |
| Eviction policy     | `allkeys-lru`, `maxmemory 256mb`                  | Configure on provider (see §4)                             |
| Image / version     | `redis:7.4-alpine`, pinned                        | Managed (provider chooses)                                 |
| Healthcheck         | `redis-cli ping` every 5s                         | Managed                                                    |
| Lifetime of data    | Ephemeral (deletable any time)                    | Treat as durable cache; never `FLUSHALL` without a runbook |

**Rule:** prod URLs MUST use the `rediss://` (TLS) scheme and include auth.
The example file `config/.env.example` shows both forms.

---

## 2. Cache Key Inventory

The audit below was produced by grepping `Services/` and `Utils/` for all
`redis.*` and `*Cache(...)` writes. Risk rating uses:

- **GREEN** — bounded fan-out, every write has a TTL, graceful on null.
- **AMBER** — bounded but should be watched (large fan-out or long TTL).
- **RED** — unbounded fan-out, missing TTL, or non-graceful on null.

| Key / prefix                                  | TTL (writes)               | Sample write location                                          | Fan-out                       | Safe if null? | Invalidation                                                        | Risk      |
| --------------------------------------------- | -------------------------- | -------------------------------------------------------------- | ----------------------------- | ------------- | ------------------------------------------------------------------- | --------- |
| `otp:<userId>`                                | 180s                       | `Services/user.Service.ts:403`                                 | 1 per user (short-lived)      | Yes           | `del` after verify (`user.Service.ts:415,446,501`)                  | GREEN     |
| `reset_verified:<userId>`                     | 600s                       | `Services/user.Service.ts:447`                                 | 1 per user                    | Yes           | `del` after reset (`user.Service.ts:500`)                           | GREEN     |
| `feature_flag:<KEY>`                          | 3600s (`setEx`)            | `Services/featureFlag.Service.ts:56`                           | bounded (flag count)          | Yes           | per-key + all-flags `del` on update (`:74-75,88-90`)                | GREEN     |
| `feature_flag:all`                            | 3600s (`setEx`)            | `Services/featureFlag.Service.ts:266`                          | 1 global                      | Yes           | invalidated on every flag write                                     | GREEN     |
| `category:*` (`CATEGORY_CONSTANTS.CACHE_PREFIX`) — `:list:<md5>` / `:simple:<md5>` / `:single:<id>` | `LIST_CACHE_TTL`           | `Services/category.Service.ts:267,449,540`                     | per unique query hash         | Yes           | broad `deleteCachePattern` on mutation (`:662-768,836-838`)         | AMBER     |
| `recently_viewed_categories:<userId>`         | inherits cache.ts default  | `Services/category.Service.ts:921` (via `setCache`)            | 1 per user                    | Yes           | `del` on view (`:893`)                                              | AMBER     |
| `categoryLogs:all:<md5>` / `:single:<id>` / `:stats:<period>` | `this.CACHE_TTL` / 600s    | `Services/category.Service.ts:1165,1257,1423`                  | per query hash                | Yes           | not aggressively invalidated; relies on TTL                         | AMBER     |
| `advertisements:*` (list/single via `CACHE_PREFIX`) | `this.CACHE_TTL`         | `Services/advertisement.Service.ts:1222,1308`                  | per query hash                | Yes           | `deleteCachePattern("advertisements:*")` on mutation                | AMBER     |
| `currentlyRunningAds`                         | `CACHE_TTL`                | `Services/advertisement.Service.ts:565`                        | 1 global                      | Yes           | `deleteCache` on mutation (`:147,349,939,1018`)                     | GREEN     |
| `advertisementLogs:*`                         | `this.CACHE_TTL` / 600s    | `Services/advertisement.Service.ts:1222,1308,1475`             | per query hash                | Yes           | TTL only                                                            | AMBER     |
| `featuredMedicines`                           | `CACHE_TTL`                | `Services/featured.Service.ts:226`                             | 1 global                      | Yes           | `deleteCache` on mutation (`:98,293,351`)                           | GREEN     |
| `featuredLogs:*`                              | `this.CACHE_TTL` / 600s    | `Services/featured.Service.ts:504,584,722`                     | per query hash                | Yes           | TTL only                                                            | AMBER     |
| `notificationLogs:*` (active/user/single/stats) | `CACHE_TTL` / 600s        | `Services/NotificationServices/notificationLog*.Service.ts`    | per query hash, per user      | Yes           | `deleteCache` + targeted `deleteCachePattern` on mutation           | AMBER     |
| `items:filtered:<md5>`                        | 600s                       | `Services/item.Service.ts:298`                                 | per filter hash               | Yes           | `redis.keys` sweep on item update (`:1494-1496`)                    | AMBER     |
| `items:category:<id>:<md5>`                   | 3600s                      | `Services/item.Service.ts:494`                                 | per category × filter hash    | Yes           | sweep on item update                                                | AMBER     |
| `deals:of-the-day`                            | 21600s (6h)                | `Services/item.Service.ts:687`                                 | 1 global                      | Yes           | `redis.del` on mutation (`:616`)                                    | GREEN     |
| `item_<id>` (exists check)                    | 3600s                      | `Services/item.Service.ts:733`                                 | 1 per item                    | Yes           | TTL only                                                            | AMBER     |
| `recently-viewed:<userId>`                    | 600s                       | `Services/item.Service.ts:893` (set) / 808 (del)               | 1 per user                    | Yes           | `del` on view                                                       | AMBER     |
| `recently-viewed-queue:<userId>` (list)       | **no TTL** (Redis list)    | `Services/item.Service.ts:959` (`rPush`), trimmed `lTrim`      | 1 per user, capped by `lTrim` | Yes           | `lTrim` keeps length bounded                                        | AMBER     |
| `global_trending_candidates` / `user_trending:<userId>` | 3600s / 600s    | `Services/item.Service.ts:1059,1114`                           | 1 global + 1 per user         | Yes           | TTL only                                                            | AMBER     |
| `item_details:<itemId>`                       | 1800s                      | `Services/item.Service.ts:1241`                                | 1 per item                    | Yes           | TTL only                                                            | AMBER     |
| `wishlist:<userId>` / wishlist sweeps         | 300s                       | `Services/item.Service.ts:1423`                                | 1 per user                    | Yes           | `del` + pattern sweep (`:1280,1494-1496`)                           | AMBER     |
| `similar_products:<id>:p<n>:l<n>`             | 1800s                      | `Services/item.Service.ts:1689`                                | per item × pagination         | Yes           | TTL only                                                            | RED — high-cardinality (item × page × limit), TTL only |
| `suggestions:<query>:<limit>`                 | 120s                       | `Services/item.Service.ts:1869`                                | per unique search query       | Yes           | TTL only                                                            | RED — user-driven keyspace, attacker can inflate       |
| `popular:search:terms:v2`                     | 86400s (24h)               | `Services/item.Service.ts:1913`                                | 1 global                      | Yes           | TTL only                                                            | GREEN     |
| `recent:searches:<userId>` (list)             | **no TTL** (Redis list)    | `Services/item.Service.ts:1967` (`lPush`), bounded by `lTrim` to `MAX_RECENT_SEARCHES` | 1 per user      | Yes           | `del` on clear (`:2151`); `lTrim` bounds size                       | AMBER     |
| `scrape:netmeds:<query>` / `:pharmeasy:` / `:1mg:` / `:apollo:` | 86400s (24h) | `Utils/webScraper.ts:86,127,170`                              | per unique scraped query      | Yes           | TTL only                                                            | RED — user-driven keyspace, 24h TTL, unbounded growth  |
| `notification:queue` (list)                   | **no TTL** (queue)         | `Services/NotificationServices/notificationQueue.Service.ts:69` | 1 global                      | No (drains via processor) | drained by processor                                                | AMBER     |
| `notification:processing` (list)              | **no TTL** (queue)         | same file                                                      | 1 global                      | No                       | drained by processor; reclaim via `lRem`                            | AMBER     |
| `notification:failed` (list)                  | **no TTL** (DLQ)           | same file                                                      | 1 global                      | No                       | manual replay (`:317-330`)                                          | AMBER     |
| `notification:ids` (set)                      | **no TTL**                 | same file (`sAdd`)                                             | grows with notif volume       | No                       | should be trimmed periodically — see §7                             | RED — unbounded set growth, no eviction key            |

**Totals:** ~30 distinct key shapes / prefixes.
**RED count:** **4** (`similar_products:*`, `suggestions:*`, `scrape:*:<query>`, `notification:ids`).

### What we did about RED keys
- The Redis proxy auto-injects a default TTL (`REDIS_DEFAULT_TTL_SECONDS`,
  default 3600) on any `set()` that forgets one — this is a belt for
  `notification:ids` if anyone later wires it with `set`. For the existing
  `sAdd` we recommend periodic trimming (see §7).
- `allkeys-lru` eviction (local dev) and a `maxmemory` cap give Redis a hard
  ceiling — RED keys cannot OOM Redis even if they grow unbounded.
- Per-key length cap (`MAX_CACHE_KEY_LENGTH=256`) blocks pathological keys
  built from unbounded user input.
- Value byte cap (`MAX_CACHE_VALUE_BYTES=512KB`) blocks accidental
  large-blob caching.

---

## 3. TTL Conventions

| TTL bucket        | Use for                                                 | Example                            |
| ----------------- | ------------------------------------------------------- | ---------------------------------- |
| 60–300s           | High-churn user-driven lookups (search, suggestions)    | `suggestions:*`, `wishlist:*`      |
| 600s              | Lists/log dashboards that tolerate ~10 min staleness    | most `*Logs:*`, `recently-viewed:*` |
| 1800–3600s        | Item / category detail pages                            | `item_details:*`, `feature_flag:*` |
| 6h–24h            | Slow-moving global aggregates / scraping                | `deals:of-the-day`, `scrape:*`     |

**When adding a NEW cache key:**
1. Pick a stable prefix (`scope:subscope:`). Avoid free-form user input in
   the prefix — only in the suffix.
2. Always pass a TTL. If you forget, the proxy will inject the default and
   log a warning ONCE per process — fix the call site.
3. Keep the key under `MAX_CACHE_KEY_LENGTH` (256 chars). Hash long inputs
   with `crypto.createHash("md5")` — see `buildListCacheKey`.
4. Make the caller graceful on `null` — never throw if cache is empty.
5. Decide invalidation strategy: explicit `deleteCache`/`deleteCachePattern`
   on every mutation path, OR TTL-only. Document it in this file.
6. Add a row to the §2 table.

---

## 4. Eviction Policy

Local Redis (`docker-compose*.yml`) is configured with:

```
--maxmemory 256mb
--maxmemory-policy allkeys-lru
--save ""
--appendonly no
```

- `allkeys-lru` evicts the least-recently-used key across the whole
  keyspace when memory fills. This is the right policy for a pure cache
  workload — older or rarely-used entries get dropped before the queue keys
  we actively read.
- `maxmemory 256mb` is enough headroom for local dev; production should set
  this on the managed provider per capacity planning.
- Persistence (RDB + AOF) is disabled in local dev — data is disposable.

**Production:** request the same policy from the managed Redis provider.
Some providers default to `noeviction`, which can cause `OOM command not
allowed when used memory > 'maxmemory'` errors under load — this is the
exact failure that motivated this hardening pass.

---

## 5. Redis Is Down — What Happens?

End-to-end degraded-mode behavior:

1. The first failed command opens the circuit breaker (`REDIS_CIRCUIT_BREAKER_MS`,
   default 60s). All proxied methods immediately return their declared
   fallback values (`null`, `0`, `[]`, `"SKIPPED"`, …) without retrying.
2. `Utils/cache.ts` — `getCache` returns `null`; `setCache` is a no-op;
   `deleteCache` / `deleteCachePattern` are no-ops returning `0`. Services
   treat this as a cache miss and hit MongoDB.
3. Auth failures (`NOAUTH`, `WRONGPASS`) — circuit opens and logs once per
   30s. Auto-reconnect loop keeps trying every `REDIS_RECONNECT_INTERVAL_MS`
   (default 15s).
4. Quota / "max requests limit exceeded" — **hard disable** for
   `REDIS_QUOTA_DISABLE_MS` (default 6 hours). This protects against
   pay-per-request billing blowups.
5. Command-level timeout (`REDIS_COMMAND_TIMEOUT_MS`, default 250 ms) means
   a slow Redis cannot wedge a request — we give up and fall back.
6. The notification queue degrades to "no-op enqueue + skip drain". Once
   Redis returns, normal enqueue resumes. There IS data loss for items
   enqueued while down — this is acceptable for push notifications.

**Net effect:** API responds, but latency on cached endpoints rises until
Redis recovers.

You can verify degraded mode locally by stopping Redis:

```sh
docker compose stop redis
# hit the API; responses should still be 200 OK, just slower
docker compose start redis
```

---

## 6. Operator Runbook

### 6.1 Flush local Redis (safe)

```sh
docker compose exec redis redis-cli FLUSHALL
# or just nuke the container — there's no volume:
docker compose rm -sf redis && docker compose up -d redis
```

### 6.2 Inspect prod Redis (read-only)

NEVER run `KEYS *` on prod — it blocks the event loop. Use `SCAN`:

```sh
redis-cli -u "$REDIS_URL" --scan --pattern 'svc1:prod:items:*' | head -50
redis-cli -u "$REDIS_URL" MEMORY USAGE svc1:prod:items:filtered:<hash>
redis-cli -u "$REDIS_URL" INFO memory
redis-cli -u "$REDIS_URL" INFO keyspace
redis-cli -u "$REDIS_URL" DBSIZE
```

To list the top memory consumers (Redis 5+):

```sh
redis-cli -u "$REDIS_URL" --bigkeys
```

### 6.3 Rotate `REDIS_KEY_PREFIX` during incident

If prod cache is poisoned (bad data, corrupted format), you can roll the
prefix to instantly orphan all old keys without a flush:

1. Set `REDIS_KEY_PREFIX=svc1:prod-v2:` in the deploy env.
2. Restart the service. New traffic populates fresh keys.
3. Old `svc1:prod:*` keys age out via `allkeys-lru` + TTLs (or `--scan`
   delete them after a cooldown).

This is the safest mitigation; no risk of partial-state during a flush.

### 6.4 Manually trip the breaker

Code path: `markRedisDegraded("reason", error?)` from `config/redis.ts`.
Useful when a service-level invariant detects bad cached data (e.g. JSON
schema mismatch).

### 6.5 Disable Redis entirely

```
REDIS_CACHE_ENABLED=false
```

Restart service. All proxied calls become immediate fallbacks. Use during
provider-side incidents to skip the round-trip entirely.

---

## 7. Memory Bloat Troubleshooting Checklist

When Redis memory is climbing:

1. **`INFO memory`** — note `used_memory_human` and `maxmemory_human`.
   If `used_memory > maxmemory`, the policy is rejecting writes (or
   evicting if LRU is set). With `allkeys-lru`, writes succeed but reads
   may miss surprisingly often.
2. **`--bigkeys`** — find the biggest-by-type keys. Cross-reference with
   §2 to see if any value is breaking the 512 KB byte cap (should be
   impossible via our wrapper; only direct `rawRedis` writes can).
3. **`DBSIZE`** + **`SCAN`** — count keys per prefix:
   ```sh
   for p in items category advertisements feature_flag notification recent suggestions scrape; do
     n=$(redis-cli -u "$REDIS_URL" --scan --pattern "svc1:prod:${p}*" | wc -l)
     echo "$p: $n"
   done
   ```
4. **Check the RED keys first** (`§2` totals):
   - `scrape:*:<query>` — kill long-tail queries: `--scan --pattern
     'svc1:prod:scrape:*' | xargs redis-cli DEL`.
   - `suggestions:*` — short TTL, should self-clear in 2 min. If not,
     the breaker may be open and TTLs aren't being read — investigate
     before deleting.
   - `similar_products:*` — high cardinality. If huge, consider raising
     TTL to consolidate fewer-but-fatter keys or moving to a smaller LRU.
   - `notification:ids` — periodically trim with a Lua script if it grows
     beyond ~100k members. Tracked as tech debt.
5. **Check key lengths** — `STRLEN` on suspicious keys; the 256-byte cap
   should hold, but legacy keys from before this change may exceed.
6. **Verify TTLs** — `TTL <key>` should return a positive number on every
   cached entry. `-1` (no TTL) on a cache key is a bug — fix the call
   site. The proxy injects a default now, but only on new writes.
7. **Look for orphan prefixes** — if `REDIS_KEY_PREFIX` was rotated but
   old keys remain, schedule a SCAN-based cleanup off-peak.
8. **Provider dashboards** — confirm `maxmemory-policy=allkeys-lru` is
   actually set on the managed instance; some providers default to
   `noeviction`.

If memory is still climbing after that, capture `MEMORY DOCTOR` output and
the `INFO` dump in the incident channel.
