# 🚀 Quick Reference - New Features

## Safe Redis Operations

### Basic Usage
```typescript
import { redisSafeGet, redisSafeSet, redisSafeDelete } from "../Utils/redisSafeWrapper";

// GET (returns null if timeout/failure)
const cached = await redisSafeGet<MyType>("key");
if (!cached) {
  const fresh = await compute();
  await redisSafeSet("key", fresh, 1800);
}

// DELETE (returns count of deleted keys)
const deleted = await redisSafeDelete("key");
const deletedMany = await redisSafeDelete("pattern:*");

// EXISTS & TTL
const exists = await redisSafeExists("key");
const ttl = await redisSafeTtl("key");  // Returns seconds remaining

// EXPIRE (set new TTL)
await redisSafeExpire("key", 3600);

// INCR (atomic increment)
const newValue = await redisSafeIncr("counter");
```

### Timeout Behavior
```
All operations max 100ms timeout
├─ If timeout → returns null/false
├─ If Redis down → returns null/false
├─ If error → logs warning, returns null/false
└─ Never throws to client!
```

---

## TTL Status Checking

### Determine Cache Status
```typescript
import { determineCacheStatus, CacheStatus } from "../Utils/ttlChecker";

const status = determineCacheStatus(
  aggregation.updatedAt,  // When was it created?
  aggregation.ttl         // What's the TTL?
);

if (status === CacheStatus.FRESH) {
  // < 75% of TTL → serve immediately
  return aggregation;
} else if (status === CacheStatus.STALE) {
  // 75-100% of TTL → serve + trigger async refresh
  triggerBackgroundRefresh();
  return aggregation;
} else {
  // > 100% of TTL → rebuild
  return await rebuild();
}
```

### Get Remaining TTL
```typescript
import { getRemainingTTL } from "../Utils/ttlChecker";

const remainingSeconds = getRemainingTTL(
  aggregation.updatedAt,
  aggregation.ttl
);

if (remainingSeconds < 0) {
  console.log("Cache expired!");
} else {
  console.log(`${remainingSeconds}s left in cache`);
}
```

### Build Cache Metadata
```typescript
import { buildCacheMetadata } from "../Utils/ttlChecker";

const meta = buildCacheMetadata(aggregation, fromCache);
// {
//   fromCache: true,
//   cacheStatus: "fresh",
//   ttl: 1800,
//   remainingTTLSeconds: 1650,
//   needsRefresh: false,
//   lastUpdated: "2026-05-01T10:00:00.000Z"
// }
```

---

## Smart Aggregation Caching

### Get or Refresh with TTL Strategy
```typescript
import AggregationService from "../Services/aggregation.service";

const { data, meta } = await AggregationService.getOrRefreshAggregation(
  {
    userId: "123",
    prescriptionId: "456",
    medicines: [
      { name: "Aspirin", quantity: 2, dosage: "500mg" },
      { name: "Paracetamol", quantity: 1, dosage: "1000mg" }
    ],
    geoLocation: { latitude: 28.6139, longitude: 77.2090 },
    radiusKm: 10,
    customTTL: 3600  // Optional: override default TTL
  },
  {
    forceRefresh: false,    // Skip cache, rebuild
    asyncRefresh: false,    // Non-blocking refresh
    ttl: 1800              // Override TTL
  }
);

// data: Complete aggregation object
// meta.fromCache: true/false
// meta.refreshed: true/false
// meta.cacheStatus: "fresh" | "stale" | "expired"
// meta.ttlSeconds: 1800
// meta.remainingTTLSeconds: 1650
```

### Explicit Refresh
```typescript
// Always rebuild from gRPC
const freshData = await AggregationService.refreshAggregation({
  userId,
  prescriptionId,
  medicines,
  // ...
});
```

### Manual Build (Don't use normally)
```typescript
// Low-level: Only use if you know what you're doing
const result = await AggregationService.buildAggregation(
  { userId, prescriptionId, medicines, ... },
  1800  // custom TTL
);
```

---

## OCR Validation Middleware

### Already Integrated
```typescript
// In prescription.Routes.ts - middleware chain:
prescriptionRouter.post(
  "/upload",
  customersMiddleware,
  uploadImage.single("prescription"),
  optimizeImageForOcr,
  ocrMiddleware({ stream: false, timeout: 20000 }),
  ocrValidationMiddleware,  // ← Validates here
  PrescriptionService.executeFallbackOcr
);
```

### Manual Validation (Testing)
```typescript
import { validateMedicalContent } from "../Middlewares/ocrValidation.middleware";

const result = validateMedicalContent(
  "Paracetamol 500mg tablet twice daily",  // extracted text
  [{ drugName: "Paracetamol" }],           // medicines
  95                                        // confidence %
);

// Returns:
// {
//   isValid: true/false,
//   confidence: 75,  // 0-100
//   reasons: ["No medicines detected"]
// }
```

### Get Keyword Statistics
```typescript
import { getMedicalKeywordStats } from "../Middlewares/ocrValidation.middleware";

const stats = getMedicalKeywordStats("Aspirin 500mg tablet daily");
// {
//   total: 2,
//   units: 1,         // mg
//   formulations: 1,  // tablet
//   routes: 0,
//   frequencies: 1    // daily
// }
```

---

## Response Structure (New)

### Prescription Upload Response
```json
{
  "event": "medicines_found",
  "searchResults": {
    "medicines": [
      {
        "name": "Aspirin",
        "stores": [
          {
            "storeId": "...",
            "storeName": "Medical Store A",
            "price": 50,
            "availability": "in_stock"
          }
        ]
      }
    ],
    "stores": [...],
    "summary": {...},
    "cacheStatus": "fresh",
    "ttl": 1800,
    "cacheExpiresAt": "2026-05-01T10:30:00Z",
    "lastRefreshedAt": "2026-05-01T10:00:00Z"
  },
  "meta": {
    "detectedCount": 3,
    "medicinesHash": "abc123...",
    "aggregationQueued": true,
    "aggregationReady": true,
    "prescriptionId": "...",
    "cache": {
      "fromCache": true,
      "refreshed": false,
      "cacheStatus": "fresh",
      "ttlSeconds": 1800,
      "remainingTTLSeconds": 1650
    }
  }
}
```

---

## Configuration

### Environment Variables
```env
# Redis
REDIS_URL=redis://localhost:6379
REDIS_CACHE_ENABLED=true
REDIS_COMMAND_TIMEOUT_MS=100

# Aggregation TTL (all in seconds)
AGGREGATION_TTL_SECONDS=1800        # Default: 30 minutes
AGGREGATION_TTL_MIN_SECONDS=300     # Minimum: 5 minutes
AGGREGATION_TTL_MAX_SECONDS=3600    # Maximum: 1 hour
```

### TTL Config (Code)
```typescript
import { TTL_CONFIG } from "../Utils/ttlChecker";

console.log(TTL_CONFIG);
// {
//   AGGREGATION_DEFAULT: 1800,
//   AGGREGATION_MIN: 300,
//   AGGREGATION_MAX: 3600,
//   CACHE_CHECK_INTERVAL: 60
// }
```

---

## Common Patterns

### Pattern 1: Check & Fallback
```typescript
// Get from cache if available
const cached = await redisSafeGet<Aggregation>("key");
if (cached) return cached;

// Fallback to database
const dbData = await AggregatedResultModel.findOne({...});
if (dbData) {
  await redisSafeSet("key", dbData, 1800);
  return dbData;
}

// Rebuild if not found
const fresh = await rebuild();
return fresh;
```

### Pattern 2: TTL-Aware Serving
```typescript
const aggregation = await AggregatedResultModel.findOne({...});

const status = determineCacheStatus(
  aggregation.updatedAt,
  aggregation.ttl
);

if (status === CacheStatus.FRESH) {
  return res.json(aggregation);  // 50ms response
}

if (status === CacheStatus.STALE) {
  // Serve old data immediately
  res.json(aggregation);
  
  // Refresh in background
  setImmediate(() => {
    void rebuild().catch(err => console.error(err));
  });
  
  return;
}

// Expired - rebuild
return res.json(await rebuild());
```

### Pattern 3: Graceful Degradation
```typescript
try {
  // Try fresh aggregation
  const { data, meta } = await AggregationService.getOrRefreshAggregation(input);
  return res.json({ data, meta });
} catch (error) {
  console.error("Fresh aggregation failed:", error);
  
  // Try stale cache
  const stale = await AggregatedResultModel.findOne({...});
  if (stale && canServeStaleCache(stale)) {
    return res.json({ data: stale, meta: { stale: true } });
  }
  
  // Give up
  return res.status(502).json({ error: "Service unavailable" });
}
```

---

## Logging

### What Gets Logged
```
[Aggregation] Cache HIT (FRESH): aggregation:user123:hash456
[Aggregation] Cache HIT (STALE): aggregation:user123:hash456, triggering async refresh
[Aggregation] Cache MISS, rebuilding: aggregation:user123:hash456
[Redis] Cache SET: aggregation:user123:hash456 (TTL: 1800s)
[Redis] Cache DELETE: pattern:* (5 keys)
[Redis] GET failed (key): Operation timeout
[OCR Validation] Medical content validated { confidence: 95, medicinesCount: 3 }
[OCR Validation] Invalid prescription: No medicines detected
[Aggregation] Build completed (stores: 5, medicines: 3, cost: $150)
```

### Monitor for:
- Redis timeouts > 5%
- OCR validation failures > 10%
- Cache hit rate < 40%
- Build times > 2 seconds

---

## Troubleshooting

### Cache not working?
1. Check Redis connection: `REDIS_URL` env var
2. Check `isRedisAvailable()` function
3. Check logs for `[Redis]` warnings
4. Verify `REDIS_CACHE_ENABLED=true`

### OCR validation rejecting valid images?
1. Check extracted text in OCR result
2. Check `validateMedicalContent()` reason codes
3. Verify medicines array is populated
4. Check confidence threshold (default 50%)

### Aggregation slow?
1. Check cache hit rate (target: 70-80%)
2. Check gRPC response time
3. Verify Redis not timing out
4. Check database query performance

### High memory usage?
1. Check Redis key count
2. Verify TTL is set on keys
3. Check for memory leaks in async refresh
4. Monitor Node.js heap size

---

## Performance Tips

### ✅ DO
- Use `getOrRefreshAggregation()` instead of `buildAggregation()`
- Let Redis timeout naturally (100ms)
- Cache aggressively (TTL 30-60 minutes)
- Use async refresh for stale cache
- Monitor cache hit rate

### ❌ DON'T
- Disable Redis timeout
- Use very short TTLs (< 5 minutes)
- Rebuild on every request
- Bypass cache validation
- Block on Redis operations

---

## Quick Links

- 📖 [Full Implementation Guide](IMPLEMENTATION_GUIDE.md)
- 📊 [Implementation Summary](IMPLEMENTATION_SUMMARY.md)
- 📝 [Prescription Routes](Routers/Routers/prescription.Routes.ts)
- 🔧 [Aggregation Service](Services/aggregation.service.ts)
- 🛡️ [Redis Safe Wrapper](Utils/redisSafeWrapper.ts)
- ⏱️ [TTL Checker](Utils/ttlChecker.ts)
- ✔️ [OCR Validation](Middlewares/ocrValidation.middleware.ts)

---

**Generated**: May 1, 2026
**Version**: 1.0
