# Prescription Streaming — Design Spec
**Date:** 2026-04-28  
**Status:** Approved

---

## Goal

Replace the prescription OCR flow with a hybrid streaming + tiered medicine-matching system that:
- Streams OCR text to the frontend in real-time (SSE)
- Matches medicines from a live database with sub-2ms hot-path latency
- Never fails completely — three tiers of graceful degradation
- Sends a clean, table-ready final summary for the frontend

---

## Architecture Overview

```
Client POST /upload-stream (multipart image)
  → prescription.Routes.ts
  → upload.single('image')
  → PrescriptionService.streamInterceptorMiddleware
    │ (Intercepts res.write and res.end to capture chunks for medicine matching)
  → ocrMiddleware({ stream: true })  [NPM Package]
    │   → Writes ocr_chunk SSE events directly to client
    │   → streamInterceptorMiddleware captures them + enqueues to worker
    │   → Calls res.end() when complete
    │   → streamInterceptorMiddleware pauses res.end(), merges medicines, emits medicines_found, then resumes res.end()
    └── On stream fail: calls next(err)
          → Error fallback middleware triggers ocrMiddleware({ stream: false })
          → Converts buffered response to fake SSE chunks + executes merge flow

Client POST /upload (multipart image)                         [unchanged]
  → ocrMiddleware({ stream: false }) (npm package) → extractFromPrescription
```

---

## Tier System — Medicine Matching

### Tier 1 — Hot Cache Worker Thread (target: ≤2ms)

**Implementation:** `Services/medicine-worker.ts` running in a `worker_threads` Worker.

**Startup:** Load top-N medicines from MongoDB sorted by `views` descending.  
`N` is controlled by `MEDICINE_CACHE_LIMIT` env var (default: 2000).

**Memory budget:** 2000 items × ~2 KB = ~4 MB. Acceptable.

**In-memory structure:**
```
hotMap:  Map<normalizedKey, IItem>   ← exact lookup O(1)
lruCache: LRU<normalizedKey, IItem>  ← rare but recurring items, capacity 500
fuseIndex: Fuse<IItem>               ← fuzzy search, threshold 0.35
```

**Key normalization** (applied before every insert and lookup):
```
normalize(s) = s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
```

**Incremental refresh** (every 10 min, no full reload spike):
- Query only items updated since `lastRefreshAt`
- Patch hotMap in-place; do NOT rebuild Fuse index unless >50 items changed
- Rebuild Fuse index off the hot path (async, swap atomically)

**LRU promotion:** On a Tier 2 DB hit for a name that was NOT in hotMap, insert into lruCache automatically → next request for same name is Tier 1.

**Worker message protocol:**
```ts
// Main → Worker
{ type: 'lookup', id: string, tokens: string[] }        // batch of normalized tokens
{ type: 'promote', item: IItem }                        // promote Tier2 hit into LRU
{ type: 'refresh' }                                     // manual cache refresh

// Worker → Main
{ type: 'result', id: string, matches: MatchResult[], misses: string[] }
{ type: 'refreshed', count: number }
```

`misses` contains tokens not found in Tier 1 — main thread uses these for Tier 2 batch query.  
After a Tier 2 hit, main sends `{ type: 'promote', item }` so the worker adds it to LRU for next request.

**Fuse.js config:**
```js
{ keys: ['itemName', 'formula'], threshold: 0.35, distance: 100,
  includeScore: true, minMatchCharLength: 3 }
```

---

### Tier 2 — MongoDB Batch Query (target: 5–15ms)

For tokens not resolved by Tier 1, collect them and fire **one batch query** (not per-chunk):

```ts
// Step 1: $text search (uses text index on itemName + formula)
db.items.find({ $text: { $search: tokens.join(' ') } }).limit(5 * tokens.length)

// Step 2: If text search returns 0 results for a token → regex fallback
db.items.find({
  $or: [ { itemName: { $regex: token, $options: 'i' } },
         { formula:   { $regex: token, $options: 'i' } } ]
}).limit(5)
```

**Required indexes:**
- `{ itemName: 'text', formula: 'text' }` — compound text index
- `{ views: -1 }` — for hot cache loading

**Timeout:** 100ms. On timeout or error → log `error` level, fall through to Tier 3 silently.

---

### Tier 3 — Regex Extraction Fallback (target: 0ms, always runs)

`extractMedicinesWithRegex` + `extractMedicinesFallback` from `ocr.Service.ts`.

**Always runs** in the final merge (not just when Tiers 1/2 fail). Acts as a recall booster — catches medicines that the DB matching may miss because the OCR name differs from DB names.

Output: `{ drugName, dosage, frequency, duration }` with `inferPrice()` estimate.  
No `matchedItem` — purely text-derived, marked with `matchTier: 'regex'`.

---

## Streaming Flow — `/upload-stream`

### SSE Primary Path (Via NPM Package)

```
1. Route middleware chain: 
   upload.single('image') -> streamInterceptorMiddleware -> ocrMiddleware({ stream: true })

2. In streamInterceptorMiddleware:
   - Monkey-patch res.write(chunk)
       - If chunk contains "event":"ocr_chunk", extract token and enqueue to pendingTokens (with dedup)
       - Pass chunk to original res.write() so client gets it live
   - Monkey-patch res.end()
       - Prevent actual end.
       - Proceed to Medicine Resolution Phase.
       - Wait for worker, merge medicines.
       - originalWrite.call(res, medicines_found_event)
       - originalEnd.call(res)
       
3. ocrMiddleware automatically connects, pipes SSE, and calls res.end() when done.
```

### HTTP Fallback Path (SSE fails)

```
1. If ocrMiddleware({ stream: true }) fails, it calls next(req.ocrError).
2. The error handling middleware in the route catches this:
   - Emits SSE: { event: 'status', data: { message: 'Switching to HTTP...', stage: 'fallback' } }
   - Invokes ocrMiddleware({ stream: false }) manually
   - On success: Iterates through req.ocrResult.lines
       - Emits fake ocr_chunk SSE event to client
       - Adds token to pendingTokens (with dedup)
   - Emits ocr_complete SSE event
   - Proceed to Medicine Resolution phase
```

### Medicine Resolution Phase

```
1. Run Tier 3 always (sync, fast): regexMedicines = extractMedicines(fullText)
2. Send pendingTokens to worker (Tier 1):
     workerRef.postMessage({ type: 'lookup', id: reqId, tokens: [...pendingTokens] })
3. Race: workerResult vs 200ms timeout
     - Early resolve: if worker returns results for ≥80% of sent tokens before 200ms, don't wait for stragglers
4. tier2Tokens = worker result `misses` (tokens not found in Tier 1)
5. Batch Tier 2 DB query for tier2Tokens (ONE query for all tokens, not per-token)
     - After DB hit: send { type: 'promote', item } back to worker for each matched item (LRU promotion)
6. MERGE: (see Merge Logic below)
7. Emit: { event: 'medicines_found', medicines, full_text, meta }
8. Emit: { event: 'done' }
9. res.end()
```

### Deduplication

```ts
const processedTokens = new Set<string>();
// Only enqueue token if:
token.length >= 3 && !processedTokens.has(token)
// After enqueue: processedTokens.add(token)
```

---

## Merge Logic — Strict Priority

```
Priority: Tier1 exact > Tier1 fuzzy (score ≤ 0.35) > Tier2 > Tier3 regex
```

Steps:
1. Group all results by `normalize(drugName)` or `formula`
2. Keep highest-priority match per unique medicine
3. Attach `similarItems` from Tier 1 fuzzy + Tier 2 matches (max 3 per medicine)
4. `similarItems` excluded from Tier 3 entries (no DB match = no similar)
5. Deduplicate by `matchedItem._id` if present

---

## SSE Events Reference

| Event | When | Payload |
|---|---|---|
| `status` | Lifecycle updates | `{ message, stage }` |
| `ocr_chunk` | Each OCR line | `{ data: text, index, confidence, bbox? }` |
| `ocr_complete` | OCR done | `{ total_lines }` |
| `medicines_found` | Final result | see shape below |
| `done` | Connection closing | `{}` |
| `error` | Hard failure | `{ message }` |
| `: ping` (comment) | Keepalive ~5s | forwarded from AI server |

### `medicines_found` shape
```ts
{
  event: 'medicines_found',
  medicines: Array<{
    drugName: string,
    dosage: string,
    frequency: string,
    duration: string,
    matchTier: 'hot_cache' | 'lru_cache' | 'db' | 'regex',
    matchedItem?: {
      _id: string,
      itemName: string,
      itemFinalPrice: number,
      formula: string,
      itemCompany: string,
      availability: boolean
    },
    similarItems?: Array<{ _id: string, itemName: string, score: number }>
  }>,
  full_text: string,
  meta: {
    detectedCount: number,
    matchedCount: number,      // medicines with matchedItem
    tier_used: string          // e.g. "hot_cache,db,regex"
  }
}
```

---

## Heartbeat

The AI server already emits SSE comment pings (`: ping\n\n`) every 5s during OCR processing. The streaming handler re-emits these verbatim to the client. No separate heartbeat needed in the Node.js layer.

For the HTTP fallback path (no AI server stream), emit a keepalive comment before the DB query:
```
res.write(': ping\n\n')
```

---

## Logging Levels

| Event | Level |
|---|---|
| Tier 1 worker error | `warn` |
| Tier 2 MongoDB error / timeout | `error` |
| Tier 3 fallback used | (no log — expected) |
| SSE primary fail → HTTP fallback | `warn` |
| Cache refresh complete | `debug` |
| Cache incremental patch | `debug` |

---

## Error Handling

- **No file**: `res.status(400).json({ error: '...' })` before SSE headers set
- **Both SSE + HTTP fail**: `{ event: 'error', message: '...' }` + `res.end()`
- **Worker crash**: `medicine-matcher.ts` listens to `worker.on('exit')` — if exit code ≠ 0, spawn a replacement worker immediately; Tier 1 treated as all-miss during the ~100ms re-init window, Tier 2 handles those tokens
- **Client disconnects**: `req.on('close')` → `controller.abort()`, clear timer, no more writes
- **res.writableEnded check** before every `res.write()` call

---

## Files Changed

| File | Change |
|---|---|
| `Routers/Routers/prescription.Routes.ts` | Update `/upload-stream` to use interceptor + `ocrMiddleware({ stream: true })` + fallback error handler |
| `Services/prescription.Service.ts` | Add `streamInterceptorMiddleware` and `executeFallbackOcr`; clean up old methods |
| `Services/medicine-worker.ts` | **New** — Worker thread: hot cache, LRU, Fuse.js, incremental refresh |
| `Services/medicine-matcher.ts` | **New** — Tier orchestration: spawn worker, Tier2 DB batch, Tier3 merge |
| `Services/ocr.Service.ts` | Remove dead WebSocket + `processPrescriptionBuffer` code; keep extraction functions |

---

## Constants (hardcoded, not env vars)

All values below are hardcoded in `medicine-matcher.ts`. No env vars.

```ts
const MEDICINE_CACHE_LIMIT   = 2_000;    // Max hot-cache size (top by views)
const CACHE_REFRESH_MS       = 600_000;  // Incremental refresh interval (10 min)
const WORKER_LRU_SIZE        = 500;      // LRU capacity inside worker
const WORKER_RESULT_TIMEOUT  = 200;      // Max ms to wait for worker response
const EARLY_RESOLVE_RATIO    = 0.8;      // Resolve if ≥80% tokens answered
```

OCR base URL: The `@development-team/bg-remover` package natively handles the fallback OCR API URL entirely internally (defaulting to the Hugging Face space). **No environment variables are needed.**

## Reuse Policy — No Duplicate Code

| What to reuse | From |
|---|---|
| `preprocessText()` | `Services/ocr.Service.ts` — import as-is |
| `extractMedicinesWithRegex()` | `Services/ocr.Service.ts` — import as-is |
| `extractMedicinesFallback()` | `Services/ocr.Service.ts` — import as-is |
| `inferPrice()` | `Services/prescription.Service.ts` — move to shared util or keep there and import |
| Mongoose item model | `Databases/Models/item.Model.ts` — import as-is |
| `customersMiddleware` | `Middlewares/CheckLoginMiddleware` — already imported in routes |
| `uploadImage` multer config | `config/multer` — already imported in routes |
| `catchAsyncErrors` | `Utils/catchAsyncErrors` — use for `extractFromPrescription` only (NOT for SSE handler, which manages its own response) |
| `ApiError` | `Utils/ApiError` — use for non-SSE error paths |

---

## Out of Scope

- Worker sharding per CPU core (future, add when traffic grows)
- Redis integration (deliberately excluded — no SPOF)
- Real-time partial medicine results per chunk (noise risk, deferred)
- Any new env vars beyond what already exists (`OCR_WS_URL`, `OCR_WS_TIMEOUT_MS`)
