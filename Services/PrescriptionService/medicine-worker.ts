import { parentPort } from 'worker_threads';
import mongoose from 'mongoose';
import { LRUCache } from 'lru-cache';
import Fuse from 'fuse.js';
import ItemModel from '../../Databases/Models/item.Model';

// Types
type NormalizeFn = (s: string) => string;

interface WorkerItem {
    _id: string;
    itemName: string;
    itemFinalPrice: number;
    formula?: string;
    itemCompany?: string;
    availability: boolean;
}

// In-memory structures
const hotMap = new Map<string, WorkerItem>();
const lruCache = new LRUCache<string, WorkerItem>({ max: 500 });
let fuseIndex: Fuse<WorkerItem>;

// Settings
const MEDICINE_CACHE_LIMIT = 2000;
let lastRefreshAt = new Date(0);

// Key normalization
const normalize: NormalizeFn = (s) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

// Connect to MongoDB if not connected (Worker threads have their own memory space)
const ensureDbConnection = async () => {
    if (mongoose.connection.readyState !== 1) {
        // Connect to MongoDB if not already connected. Assumes the main thread has set the URI in env.
        await mongoose.connect(process.env.MONGODB_URI || '');
    }
};

const mapToWorkerItem = (doc: any): WorkerItem => ({
    _id: doc._id.toString(),
    itemName: doc.itemName,
    itemFinalPrice: doc.itemFinalPrice || 0,
    formula: doc.formula,
    itemCompany: doc.itemCompany,
    // Simple availability check based on existence, you might need a more complex one
    availability: true 
});

const refreshCache = async (forceFull = false) => {
    await ensureDbConnection();

    try {
        if (forceFull || hotMap.size === 0) {
            // Full reload
            const items = await ItemModel.find({})
                .sort({ views: -1 })
                .limit(MEDICINE_CACHE_LIMIT)
                .lean();

            hotMap.clear();
            const workerItems: WorkerItem[] = [];

            for (const doc of items) {
                const item = mapToWorkerItem(doc);
                workerItems.push(item);
                if (item.itemName) hotMap.set(normalize(item.itemName), item);
                if (item.formula) hotMap.set(normalize(item.formula), item);
            }

            fuseIndex = new Fuse(workerItems, {
                keys: ['itemName', 'formula'],
                threshold: 0.35,
                distance: 100,
                includeScore: true,
                minMatchCharLength: 3
            });

        } else {
            // Incremental refresh
            const items = await ItemModel.find({ updatedAt: { $gt: lastRefreshAt } }).lean();
            if (items.length > 0) {
                for (const doc of items) {
                    const item = mapToWorkerItem(doc);
                    if (item.itemName) hotMap.set(normalize(item.itemName), item);
                    if (item.formula) hotMap.set(normalize(item.formula), item);
                }
                
                if (items.length > 50) {
                    // Rebuild fuse index if too many changes
                    const allItems = Array.from(new Set(hotMap.values()));
                    fuseIndex = new Fuse(allItems, {
                        keys: ['itemName', 'formula'],
                        threshold: 0.35,
                        distance: 100,
                        includeScore: true,
                        minMatchCharLength: 3
                    });
                }
            }
        }
        lastRefreshAt = new Date();
        parentPort?.postMessage({ type: 'refreshed', count: hotMap.size });
    } catch (err) {
        console.error('Worker cache refresh failed:', err);
    }
};

const lookupTokens = (tokens: string[]) => {
    const matches: any[] = [];
    const misses: string[] = [];

    for (const rawToken of tokens) {
        const token = normalize(rawToken);
        if (!token) continue;

        // Tier 1 - Exact Match (HotMap)
        if (hotMap.has(token)) {
            matches.push({ token: rawToken, matchTier: 'hot_cache', matchedItem: hotMap.get(token) });
            continue;
        }

        // Tier 1 - LRU Match
        if (lruCache.has(token)) {
            matches.push({ token: rawToken, matchTier: 'lru_cache', matchedItem: lruCache.get(token) });
            continue;
        }

        // Tier 1 - Fuzzy Match (Score <= 0.35)
        if (fuseIndex) {
            const fuzzyResults = fuseIndex.search(token);
            const bestFuzzy = fuzzyResults[0];
            if (bestFuzzy && bestFuzzy.score !== undefined && bestFuzzy.score <= 0.35) {
                matches.push({
                    token: rawToken,
                    matchTier: 'hot_cache', // Treated as hot_cache but it's fuzzy
                    matchedItem: bestFuzzy.item,
                    similarItems: fuzzyResults.slice(0, 3).map((r: any) => ({ _id: r.item._id, itemName: r.item.itemName, score: r.score }))
                });
                continue;
            }
        }

        // Missed Tier 1 completely
        misses.push(rawToken);
    }

    return { matches, misses };
};

// Initial load
refreshCache(true);

// Listen to main thread
parentPort?.on('message', async (msg) => {
    if (msg.type === 'lookup') {
        const result = lookupTokens(msg.tokens || []);
        parentPort?.postMessage({ type: 'result', id: msg.id, ...result });
    } else if (msg.type === 'promote') {
        if (msg.item && msg.item.itemName) {
            lruCache.set(normalize(msg.item.itemName), msg.item);
        }
    } else if (msg.type === 'refresh') {
        await refreshCache();
    }
});
