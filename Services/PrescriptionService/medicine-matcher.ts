import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import ItemModel from "../../Databases/Models/item.Model";
import { extractMedicinesWithRegex, MedicineDetails } from "./ocr.Service";
import mongoose from "mongoose";

// Handle __filename in ES modules
const __filename = fileURLToPath(import.meta.url);

// Ensure the worker is resolved properly whether running via TS-Node or compiled JS.
const workerPath = __filename.replace("medicine-matcher", "medicine-worker");

// Initialize Worker
let worker: Worker | null = null;
let pendingLookups: Map<
  string,
  { resolve: Function; reject: Function; timer: NodeJS.Timeout }
> = new Map();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(workerPath);
    worker.on("message", (msg) => {
      if (msg.type === "result" && pendingLookups.has(msg.id)) {
        const pending = pendingLookups.get(msg.id)!;
        clearTimeout(pending.timer);
        pendingLookups.delete(msg.id);
        pending.resolve({ matches: msg.matches, misses: msg.misses });
      } else if (msg.type === "refreshed") {
        console.log(`[Worker] Cache refreshed. Hot map size: ${msg.count}`);
      }
    });
    worker.on("error", (err) => console.error("[Worker] Error:", err));
    worker.on("exit", (code) => {
      console.error(`[Worker] Exited with code ${code}. Respawning...`);
      worker = null; // Next request will respawn
    });
  }
  return worker;
}

export interface MergedMedicineResult {
  token: string;
  matchTier: string; // 'hot_cache', 'lru_cache', 'db_batch', 'regex'
  matchedItem?: any;
  similarItems?: any[];
  regexDetails?: MedicineDetails;
}

const WORKER_RESULT_TIMEOUT = 200; // 200ms
const EARLY_RESOLVE_RATIO = 0.8; // 80%

async function lookupTokensWorker(
  tokens: string[],
): Promise<{ matches: any[]; misses: string[] }> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(7);
    const w = getWorker();

    const timer = setTimeout(() => {
      if (pendingLookups.has(id)) {
        pendingLookups.delete(id);
        // Worker timed out. Treat all as misses for DB fallback.
        resolve({ matches: [], misses: tokens });
      }
    }, WORKER_RESULT_TIMEOUT);

    pendingLookups.set(id, { resolve, reject, timer });
    w.postMessage({ type: "lookup", id, tokens });
  });
}

// Normalize for MongoDB DB lookup
const normalize = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

async function lookupTokensMongoDB(tokens: string[]) {
  if (tokens.length === 0) return [];

  // Combine text search and regex for Tier 2 Batch Query
  const orConditions = tokens.map((token) => ({
    $or: [
      { $text: { $search: `"${token}"` } },
      { itemName: { $regex: new RegExp(token.split(" ").join(".*"), "i") } },
    ],
  }));

  const results = await ItemModel.find({ $or: orConditions }).limit(20).lean();
  return results;
}

// ---------------------------------------------------------------------------
// REAL-TIME STREAMING: yields each medicine the INSTANT it is resolved
// ---------------------------------------------------------------------------
export async function* resolveMedicinesStream(
  fullText: string,
  streamedTokens: string[],
): AsyncGenerator<MergedMedicineResult> {
  const uniqueTokens = Array.from(
    new Set(streamedTokens.filter((t) => t.length > 2)),
  );

  // Tier 3: Regex runs instantly on full text
  const regexMedicines = extractMedicinesWithRegex(fullText);

  // If no OCR tokens available, just stream regex results immediately
  if (uniqueTokens.length === 0) {
    for (const rm of regexMedicines) {
      yield { token: rm.drugName, matchTier: "regex", regexDetails: rm };
    }
    return;
  }

  const alreadyYielded = new Set<string>();

  // Tier 1: Worker thread (Hot cache / LRU cache) — fastest, emit immediately
  const workerRes = await lookupTokensWorker(uniqueTokens);

  for (const match of workerRes.matches) {
    const result: MergedMedicineResult = {
      token: match.token,
      matchTier: match.matchTier,
      matchedItem: match.matchedItem,
      similarItems: match.similarItems,
    };
    // Attach regex details if available
    const regexHit = regexMedicines.find((rm) =>
      normalize(rm.drugName).includes(normalize(match.token)) ||
      normalize(match.token).includes(normalize(rm.drugName)),
    );
    if (regexHit) result.regexDetails = regexHit;

    alreadyYielded.add(normalize(match.token));
    yield result; // Emit immediately, don't wait for DB
  }

  // Tier 2: DB lookup for misses — emit each as it's matched
  if (workerRes.misses.length > 0) {
    const dbItems = await lookupTokensMongoDB(workerRes.misses);

    for (const token of workerRes.misses) {
      const normToken = normalize(token);
      const matchedDbItem = dbItems.find(
        (item) =>
          normalize(item.itemName).includes(normToken) ||
          (item.formula && normalize(item.formula).includes(normToken)),
      );

      if (matchedDbItem) {
        alreadyYielded.add(normToken);
        // Promote to LRU cache asynchronously
        getWorker().postMessage({ type: "promote", item: matchedDbItem });

        const result: MergedMedicineResult = {
          token,
          matchTier: "db_batch",
          matchedItem: matchedDbItem,
        };
        const regexHit = regexMedicines.find((rm) =>
          normalize(rm.drugName).includes(normToken) ||
          normToken.includes(normalize(rm.drugName)),
        );
        if (regexHit) result.regexDetails = regexHit;

        yield result; // Emit the moment DB returns it
      }
    }
  }

  // Tier 3: Regex-only medicines not covered by token match
  for (const rm of regexMedicines) {
    const normName = normalize(rm.drugName);
    if (!alreadyYielded.has(normName)) {
      yield { token: rm.drugName, matchTier: "regex", regexDetails: rm };
    }
  }
}

// ---------------------------------------------------------------------------
// BATCH version kept for fallback/non-streaming routes
// ---------------------------------------------------------------------------
export async function resolveMedicines(
  fullText: string,
  streamedTokens: string[],
): Promise<MergedMedicineResult[]> {
  const results: MergedMedicineResult[] = [];
  for await (const item of resolveMedicinesStream(fullText, streamedTokens)) {
    results.push(item);
  }
  return results;
}

function mergeWithRegex(
  matchedList: MergedMedicineResult[],
  regexMeds: MedicineDetails[],
): MergedMedicineResult[] {
  const result = [...matchedList];

  // For any regex item that isn't already covered by a token match, add it
  for (const rm of regexMeds) {
    const alreadyMatched = result.find(
      (m) =>
        normalize(m.token).includes(normalize(rm.drugName)) ||
        normalize(rm.drugName).includes(normalize(m.token)),
    );

    if (alreadyMatched) {
      alreadyMatched.regexDetails = rm; // Attach dosing info
    } else {
      result.push({
        token: rm.drugName,
        matchTier: "regex",
        regexDetails: rm,
      });
    }
  }

  return result;
}
