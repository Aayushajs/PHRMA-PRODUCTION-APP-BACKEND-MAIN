/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR Service - Prescription image processing with Tesseract.          │
│  Extracts medicine details from prescription images using OCR.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import axios from "axios";
import WebSocket from "ws";
import crypto from "crypto";
import FormData from "form-data";
import { getIO } from "../config/socket";

export interface MedicineDetails {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface OcrResult {
  text: string;
  medicines: MedicineDetails[];
  meta: {
    detectedCount: number;
  };
}

const OCR_API_KEYS = (process.env.OCR_API_KEYS || "dummy_key_1,dummy_key_2,dummy_key_3,dummy_key_4,dummy_key_5").split(',');
console.log("ocr keys : ", OCR_API_KEYS);
let currentKeyIndex = 0;

const OCR_WS_TIMEOUT_MS = Number(process.env.OCR_WS_TIMEOUT_MS || 30000);
const OCR_WS_DEBUG = String(process.env.OCR_WS_DEBUG || "true").toLowerCase() === "true";

function createOcrLogger(enabled: boolean, traceId: string) {
  return (...args: unknown[]) => {
    if (!enabled) return;
    console.log(`[backend][ocr][${traceId}]`, ...args);
  };
}

// Preprocess text: normalize whitespace and remove extra characters
export function preprocessText(text: string): string {
  console.log("Text of preprocessText : ", text);
  return text
    .replace(/[ \t]+/g, " ") // Normalize multiple spaces to single space, but keep \n
    .replace(/[\n\r]+/g, "\n") // Normalize line breaks
    .trim();
}

// Extract medicines using regex pattern with prescription keywords
export function extractMedicinesWithRegex(text: string): MedicineDetails[] {
  const medicines: MedicineDetails[] = [];

  // Pattern 1: Prescription table format (Medicine | Dosage | Instructions)
  // Matches: "Itracanazole 20 days 1 for 3" or "Ringguard 30 days 50 for 5"
  const tablePattern = /([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?)\s+[\d]+)/gi;
  
  let match;
  while ((match = tablePattern.exec(text)) !== null) {
    medicines.push({
      drugName: match[1]!.trim(),
      dosage: "Not specified",
      frequency: match[3]!.trim(),
      duration: match[2]!.trim(),
    });
  }

  // Pattern 2: Standard format with dosage units (mg, ml, etc.)
  // Matches: "Aspirin 500mg 2x daily for 7 days"
  if (medicines.length === 0) {
    const standardPattern =
      /([A-Za-z\s]+?)\s+(\d+\.?\d*\s*(?:mg|ml|units?))\s+(\d+\s*x\s*daily|once|twice|thrice|daily|twice daily|once daily)\s+(?:for\s+)?(\d+\s*(?:days?|weeks?|months?))/gi;

    while ((match = standardPattern.exec(text)) !== null) {
      medicines.push({
        drugName: match[1]!.trim(),
        dosage: match[2]!.trim(),
        frequency: match[3]!.trim(),
        duration: match[4]!.trim(),
      });
    }
  }

  return medicines;
}

// Fallback extraction: scan lines for medicine keywords and patterns
export function extractMedicinesFallback(text: string): MedicineDetails[] {
  const medicines: MedicineDetails[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Keywords that indicate prescription section
  const prescriptionKeywords = ["PRESCRIPTION", "Medicine", "Dosage", "Instructions"];
  const isPrescriptionSection = (lineText: string) =>
    prescriptionKeywords.some((kw) => lineText.toUpperCase().includes(kw.toUpperCase()));

  let inPrescriptionSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i];
    if (!trimmed) continue; // Satisfies TS 'noUncheckedIndexedAccess'

    // Detect prescription section start
    if (isPrescriptionSection(trimmed)) {
      inPrescriptionSection = true;
      continue;
    }

    // Skip table headers or empty rows
    if (
      trimmed.match(/^(Parameter|Value|Status|Medicine|Dosage|Instructions)$/i) || trimmed.length <= 1
    ) {
      continue;
    }

    // Extract medicine from prescription section
    if (inPrescriptionSection) {
      // 1. Single-line match (e.g. "Itracanazole 20 days 1 for 3")
      const medicineMatch = trimmed.match(
        /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?|far)\s+[\d]+)$/i
      );

      if (medicineMatch) {
        medicines.push({
          drugName: medicineMatch[1]!.trim(),
          dosage: "Not specified",
          frequency: medicineMatch[3]!.trim(),
          duration: medicineMatch[2]!.trim(),
        });
        continue;
      }

      // 2. Multi-line chunk match: Name -> Duration -> Frequency
      // e.g., i="Paracetamal", i+1="10day", i+2="5far2"
      if (i + 2 < lines.length) {
         const possibleName = trimmed;
         const possibleDuration = lines[i + 1];
         const possibleFreq = lines[i + 2];

         if (possibleDuration && possibleFreq && 
             possibleDuration.match(/^\d+\s*(?:days?|weeks?|months?)$/i) &&
             possibleFreq.match(/^[\d\s]+(?:for|x|times?|far)\s*[\d]+$/i)) {
             medicines.push({
                 drugName: possibleName,
                 dosage: "Not specified",
                 duration: possibleDuration,
                 frequency: possibleFreq
             });
             i += 2; // Skip the next two lines as they are consumed
             continue;
         }
      }

      // 3. Fallback: match any line with dosage units (mg, ml, etc.)
      const dosageMatch = trimmed.match(/(\d+\.?\d*\s*(?:mg|ml|units?))/i);
      if (dosageMatch) {
        const parts = trimmed.split(/\s+/);
        const drugName = parts
          .slice(0, parts.findIndex((w) => /\d+/.test(w)))
          .join(" ")
          .trim();

        if (drugName) {
          medicines.push({
            drugName: drugName || "Unknown",
            dosage: dosageMatch[1]!.trim(),
            frequency: "Not specified",
            duration: "Not specified",
          });
        }
      }
    }
  }

  return medicines;
}

async function tryApiExtraction(buffer: Buffer): Promise<OcrResult> {
  const startIdx = currentKeyIndex;
  let attempts = 0;
  
  while(attempts < OCR_API_KEYS.length) {
    const key = OCR_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % OCR_API_KEYS.length;
    attempts++;
    
    try {
      const formData = new FormData();
      formData.append('image', buffer, { filename: 'image.png', contentType: 'image/png' });
      
      const response = await axios.post(process.env.OCR_REST_API_URL || 'https://api.ocr.example.com/extract', formData, {
        headers: {
          'Authorization': `Bearer ${key}`,
          ...formData.getHeaders()
        },
        timeout: 5000
      });
      
      const preprocessedText = preprocessText(response.data.text || '');
      let medicines = extractMedicinesWithRegex(preprocessedText);
      if (medicines.length === 0) {
        medicines = extractMedicinesFallback(preprocessedText);
      }
      
      return {
        text: preprocessedText,
        medicines,
        meta: { detectedCount: medicines.length }
      };
    } catch (error) {
      console.log(`API key ${key} failed, trying next...`);
    }
  }
  
  throw new Error('All API keys failed');
}

const DEFAULT_OCR_WS_URL = process.env.OCR_WS_URL || 'wss://DevelopmentT-background-remover.hf.space';

function runOcrOverWsWithSocketIo(imageBuffer: Buffer, userId: string, timeout = 30000): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    const traceId = `ocr_${crypto.randomBytes(4).toString('hex')}`;
    const log = createOcrLogger(OCR_WS_DEBUG, traceId);
    // Use the provided userId when available so the OCR server logs match our user rooms.
    // Fall back to a random user_xxx id only if none is supplied.
    const safeUserId = userId && String(userId).trim().length > 0
      ? `user_${String(userId).replace(/[^a-zA-Z0-9_\-:.@]/g, '')}`
      : 'user_' + crypto.randomBytes(4).toString('hex');

    const wsEndpoint = `${DEFAULT_OCR_WS_URL}/ws/ocr?user_id=${encodeURIComponent(safeUserId)}`;
    const ws = new WebSocket(wsEndpoint);
    const chunks: any[] = [];
    let settled = false;

    const safeResolve = (payload: OcrResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('Resolved OCR result', { detectedCount: payload.meta.detectedCount });
      resolve(payload);
    };

    const safeReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('Rejected OCR request', { message: error.message });
      reject(error);
    };

    log('Opening OCR websocket', {
      wsEndpoint,
      roomUserId: userId,
      imageBytes: imageBuffer.length,
      timeout
    });

    let io: ReturnType<typeof getIO> | null = null;
    try {
       io = getIO();
    } catch (e) {
       console.warn("Socket.io not initialized. Client will not receive live updates.");
    }
    const room = `user:${userId}`;
    console.log('[backend][ocr] mapping websocket user_id -> room', { wsUserId: safeUserId, room });

    const timer = setTimeout(() => {
      log('OCR websocket timed out; terminating connection');
      ws.terminate();
      if (io) io.to(room).emit('ocr:error', { message: 'OCR connection timed out' });
      safeReject(new Error('OCR WebSocket connection timed out'));
    }, timeout);

    ws.on('open', () => {
      log('OCR websocket open; sending image payload');
      if (io) io.to(room).emit('ocr:status', { message: 'Connected to OCR server, sending image...' });
      ws.send(imageBuffer);
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        log('OCR websocket event received', { event: parsed.event || 'unknown' });
        
        if (io) io.to(room).emit('ocr:update', parsed);
        
        if (parsed.event === 'ocr_chunk') {
          chunks.push({ text: parsed.text, confidence: parsed.confidence });
        } else if (parsed.event === 'ocr_complete') {
          ws.close();
          
          const preprocessedText = preprocessText(parsed.full_text || '');
          console.log("preprocessedText: ", preprocessedText);
          let medicines = extractMedicinesWithRegex(preprocessedText);
          if (medicines.length === 0) {
            medicines = extractMedicinesFallback(preprocessedText);
          }
          
          safeResolve({
            text: preprocessedText,
            medicines,
            meta: { detectedCount: medicines.length }
          });
        } else if (parsed.event === 'error') {
          ws.close();
          safeReject(new Error(parsed.message || 'OCR server returned an error'));
        }
      } catch (e) {
        log('Malformed OCR websocket message', { raw: data.toString() });
      }
    });

    ws.on('error', (err) => {
      log('OCR websocket error', { message: err.message });
      if (io) io.to(room).emit('ocr:error', { message: err.message });
      safeReject(err as Error);
    });

    ws.on('close', (code, reason) => {
      log('OCR websocket closed', {
        code,
        reason: reason ? reason.toString() : ''
      });
      if (!settled && code !== 1000) {
        safeReject(new Error(`OCR WebSocket closed unexpectedly (code: ${code})`));
      }
    });
  });
}

export async function processPrescriptionBuffer(buffer: Buffer, userId: string): Promise<OcrResult> {
  let io: ReturnType<typeof getIO> | null = null;
  try {
     io = getIO();
  } catch (e) {}

  if (OCR_WS_DEBUG) {
    console.log('[backend][ocr] Starting prescription OCR flow', {
      userId,
      imageBytes: buffer.length,
      wsUrl: DEFAULT_OCR_WS_URL,
      wsTimeoutMs: OCR_WS_TIMEOUT_MS
    });
  }

  try {
    if (io) io.to(`user:${userId}`).emit('ocr:status', { message: 'Attempting OCR via API keys...' });
    return await tryApiExtraction(buffer);
  } catch (error) {
    console.log("All API keys failed, falling back to websocket OCR package...");
    if (io) io.to(`user:${userId}`).emit('ocr:status', { message: 'API keys failed. Falling back to real-time websocket OCR...' });
    
    return await runOcrOverWsWithSocketIo(buffer, userId, OCR_WS_TIMEOUT_MS);
  }
}
