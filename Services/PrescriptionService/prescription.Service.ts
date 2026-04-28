/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Service - Handle prescription uploads and processing.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "../../Utils/catchAsyncErrors";
import { ApiError } from "../../Utils/ApiError";
import NotificationService from "../../Middlewares/LogMedillewares/notificationLogger";
import User from "../../Databases/Models/user.Models";
import { emitCustomEvent } from "../../Utils/socketEmitters";
import {
  MedicineDetails,
  parsePrescriptionText,
} from "./ocr.Service";
import { resolveMedicinesStream } from "./medicine-matcher";

interface EnrichedMedicine extends MedicineDetails {
  price: number;
  availability: boolean;
}

// resolveMedicines (batch) replaced by resolveMedicinesStream for real-time delivery

export default class PrescriptionService {
  public static streamInterceptorMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.file) return next();

    const userId = (req as any).user?._id;

    const originalWrite = res.write;
    const originalEnd = res.end;
    const pendingTokens = new Set<string>();
    let fullText = "";
    let isIntercepting = true;

    res.write = function (chunk: any, encodingOrCb?: any, cb?: any): boolean {
      if (isIntercepting) {
        const strChunk = Buffer.isBuffer(chunk)
          ? chunk.toString()
          : String(chunk);
        fullText += strChunk;

        const lines = strChunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));

              // Emit via Socket.io to the user's room
              if (userId) {
                emitCustomEvent("ocr:stream", data, `user:${userId}`);
              }

              if (data.event === "ocr_chunk") {
                // Python API sends text in `data.data`, fallback to `data.text`
                const token = (data.data ?? data.text ?? "").toString().trim();
                if (token.length > 2) {
                  pendingTokens.add(token);
                }
              }
            } catch (e) {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }
      return originalWrite.call(res, chunk, encodingOrCb, cb);
    } as any;

    res.end = function (chunk?: any, encodingOrCb?: any, cb?: any): Response {
      if (!isIntercepting) {
        return originalEnd.call(res, chunk, encodingOrCb, cb);
      }

      if (chunk) {
        const strChunk = Buffer.isBuffer(chunk)
          ? chunk.toString()
          : String(chunk);
        fullText += strChunk;
        originalWrite.call(res, chunk, "utf8");
      }

      isIntercepting = false; // Prevent recursion

      // If fullText is NOT SSE (no "data: " lines), it's a plain JSON fallback response.
      // Skip our processing — executeFallbackOcr will handle socket emissions.
      const isSSEResponse = fullText.includes("data: ");
      if (!isSSEResponse || pendingTokens.size === 0) {
        (originalEnd as any).call(res);
        return res;
      }

      // --- REAL-TIME STREAMING: emit each medicine the INSTANT it is resolved ---
      (async () => {
        const allEnriched: any[] = [];
        try {
          const stream = resolveMedicinesStream(fullText, Array.from(pendingTokens));

          for await (const medicine of stream) {
            const enriched = {
              ...medicine,
              price: medicine.regexDetails ? (inferPrice(medicine.regexDetails) ?? 99.0) : 99.0,
              availability: true,
            };
            allEnriched.push(enriched);

            // Emit each medicine individually as soon as it's found
            const medicineEvent = { event: "medicine_item", medicine: enriched };
            if (userId) {
              emitCustomEvent("ocr:stream", medicineEvent, `user:${userId}`);
            }
            const sseEvent = `data: ${JSON.stringify(medicineEvent)}\n\n`;
            originalWrite.call(res, sseEvent, "utf8");
          }

          // Final summary event after all medicines streamed
          const doneData = { event: "medicines_found", medicines: allEnriched };
          if (userId) {
            emitCustomEvent("ocr:stream", doneData, `user:${userId}`);
          }
          const doneEvent = `data: ${JSON.stringify(doneData)}\n\n`;
          originalWrite.call(res, doneEvent, "utf8");
          (originalEnd as any).call(res);

          // Push notification on completion
          try {
            const uid = (req as any).user?._id;
            if (uid) {
              const user = await User.findById(uid).select("fcmToken name");
              if (user && user.fcmToken) {
                const message = `Status: medicines_found. Extracted ${allEnriched.length} medicines from the prescription.`;
                await NotificationService.sendNotificationWithLog(
                  user._id,
                  user.fcmToken,
                  "Prescription Processing Complete",
                  message,
                  {
                    type: "SYSTEM",
                    payload: { event: "medicines_found", count: allEnriched.length },
                  },
                );
              }
            }
          } catch (err) {
            console.error("[streamInterceptorMiddleware] Failed to send push notification:", err);
          }
        } catch (err: any) {
          console.error("[streamInterceptorMiddleware] Medicine resolution failed:", err);
          const errorMsg = "Failed to resolve medicines";
          const errorData = { event: "error", message: errorMsg };

          if (userId) {
            emitCustomEvent("ocr:stream", errorData, `user:${userId}`);
          }
          originalWrite.call(res, `data: ${JSON.stringify(errorData)}\n\n`, "utf8");
          (originalEnd as any).call(res);

          try {
            const uid = (req as any).user?._id;
            if (uid) {
              const user = await User.findById(uid).select("fcmToken name");
              if (user && user.fcmToken) {
                await NotificationService.sendNotificationWithLog(
                  user._id,
                  user.fcmToken,
                  "Prescription Processing Failed",
                  `Status: error. ${errorMsg}`,
                  { type: "SYSTEM", payload: { event: "error", error: errorMsg } },
                );
              }
            }
          } catch (notifErr) {
            console.error("[streamInterceptorMiddleware] Failed to send error push notification:", notifErr);
          }
        }
      })();

      return res;
    } as any;

    next();
  };

  public static executeFallbackOcr = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.file) {
        return next(new ApiError(400, "No prescription image provided"));
      }

      const ocrError = (req as any).ocrError;
      if (ocrError) {
        const errorMsg =
          ocrError.message || "Failed to extract text from image";
        try {
          const userId = (req as any).user?._id;
          if (userId) {
            const user = await User.findById(userId).select("fcmToken name");
            if (user && user.fcmToken) {
              await NotificationService.sendNotificationWithLog(
                user._id,
                user.fcmToken,
                "Prescription Processing Failed",
                `Status: error. ${errorMsg}`,
                {
                  type: "SYSTEM",
                  payload: { event: "error", error: errorMsg },
                },
              );
            }
          }
        } catch (notifErr) {
          console.error("Failed to send error push notification:", notifErr);
        }

        return next(new ApiError(502, errorMsg));
      }

      const ocrResult = (req as any).ocrResult;
      const rawText = ocrResult?.full_text || "";

      // Parse full structured prescription (fast synchronous regex — <1ms)
      const parsed = parsePrescriptionText(rawText);

      const enriched: EnrichedMedicine[] = parsed.medicines.map((m) => ({
        ...m,
        price: inferPrice(m) ?? 99.0,
        availability: true,
      }));

      const response = {
        event: "medicines_found",
        prescription: {
          patientInfo: parsed.patientInfo,
          clinicalFindings: parsed.clinicalFindings,
          vitalSigns: parsed.vitalSigns,
          medicines: enriched,
          doctorInfo: parsed.doctorInfo,
        },
        meta: {
          detectedCount: enriched.length,
          rawText,
        },
      };

      const userId = (req as any).user?._id;

      // Emit each medicine in real-time via Socket.io
      if (userId) {
        for (const m of enriched) {
          emitCustomEvent("ocr:stream", { event: "medicine_item", medicine: m }, `user:${userId}`);
        }
        // Final summary
        emitCustomEvent("ocr:stream", { event: "medicines_found", medicines: enriched }, `user:${userId}`);
      }

      // Trigger Push Notification for Completion
      try {
        const userId = (req as any).user?._id;
        if (userId) {
          const user = await User.findById(userId).select("fcmToken name");
          if (user && user.fcmToken) {
            const message = `Status: medicines_found. Extracted ${enriched.length} medicines from the prescription.`;
            await NotificationService.sendNotificationWithLog(
              user._id,
              user.fcmToken,
              "Prescription Processing Complete",
              message,
              {
                type: "SYSTEM",
                payload: { event: "medicines_found", count: enriched.length },
              },
            );
          }
        }
      } catch (err) {
        console.error(
          "[executeFallbackOcr] Failed to send push notification:",
          err,
        );
      }

      // Since we are falling back from SSE, output SSE-like formatting if interceptor is in place
      if (req.headers.accept === "text/event-stream") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Emit status
        res.write(
          `data: ${JSON.stringify({ event: "status", message: "Switched to HTTP fallback", stage: "fallback" })}\n\n`,
        );

        // Emit chunks so frontend receives words
        for (const m of parsed.medicines) {
          res.write(
            `data: ${JSON.stringify({ event: "ocr_chunk", text: m.drugName })}\n\n`,
          );
        }
        res.write(`data: ${JSON.stringify({ event: "ocr_complete" })}\n\n`);
        res.write(`data: ${JSON.stringify(response)}\n\n`);
        return res.end();
      }

      return res.json(response);
    },
  );
}

function inferPrice(m: MedicineDetails): number | null {
  const mgMatch = m.dosage.match(/(\d+\.?\d*)\s*mg/i);
  if (mgMatch && mgMatch[1]) {
    const mg = parseFloat(mgMatch[1]);
    if (!isNaN(mg)) return Math.round((mg * 0.2 + 20) * 100) / 100;
  }
  return null;
}
