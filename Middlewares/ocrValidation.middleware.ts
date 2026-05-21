/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR Validation Middleware - Authenticity check for medical uploads.  │
│  Rejects fake/non-medical images early with medical keyword validation│
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Utils/errors/ApiError";

/**
 * Medical keywords patterns to validate prescription authenticity
 */
const MEDICAL_KEYWORDS = {
  units: ["mg", "ml", "g", "µg", "mcg"],
  formulations: ["tablet", "capsule", "syrup", "injection", "drops", "cream", "ointment", "powder", "liquid", "suspension"],
  common_medicines: ["paracetamol", "ibuprofen", "aspirin", "amoxicillin", "cetirizine", "metformin", "lisinopril", "atorvastatin"],
  routes: ["orally", "intravenously", "intramuscularly", "subcutaneously", "topically", "rectally"],
  frequencies: ["once daily", "twice daily", "thrice daily", "bedtime", "breakfast", "lunch", "dinner", "every", "hr", "daily", "weekly"],
} as const;

/**
 * Build regex pattern for medical dosage validation
 * Matches patterns like: "500mg", "10ml", "1 tablet", "2 capsules"
 */
const DOSAGE_PATTERN = /(\d+\.?\d*)\s*(mg|ml|g|µg|mcg|tablet|capsule|drop|unit|iu)\b/gi;

/**
 * Build regex for medical keyword detection
 */
const buildMedicalKeywordRegex = (): RegExp => {
  const allKeywords = [
    ...MEDICAL_KEYWORDS.units,
    ...MEDICAL_KEYWORDS.formulations,
    ...MEDICAL_KEYWORDS.routes,
    ...MEDICAL_KEYWORDS.frequencies,
  ];
  
  // Escape special characters and create case-insensitive pattern
  const escapedKeywords = allKeywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escapedKeywords.join("|")})\\b`, "gi");
};

const MEDICAL_KEYWORD_REGEX = buildMedicalKeywordRegex();

/**
 * Confidence threshold for accepting medical content
 */
const MINIMUM_CONFIDENCE_THRESHOLD = 50; // 50%

/**
 * Minimum required medicines in prescription
 */
const MINIMUM_MEDICINES_COUNT = 1; // At least 1 medicine must be detected

/**
 * Validate extracted text contains medical content
 * Returns: { isValid, confidence, reasons }
 */
export const validateMedicalContent = (
  extractedText: string,
  medicinesArray: any[] = [],
  confidence: number = 100
) => {
  const reasons: string[] = [];
  const results = {
    isValid: false,
    confidence: 0,
    reasons,
  };

  // Check 1: Text exists
  if (!extractedText || extractedText.trim().length === 0) {
    reasons.push("No text extracted from image");
    return results;
  }

  // Check 2: Minimum medicines detected
  if (!Array.isArray(medicinesArray) || medicinesArray.length < MINIMUM_MEDICINES_COUNT) {
    reasons.push(
      `No medicines detected. Expected at least ${MINIMUM_MEDICINES_COUNT}, found ${medicinesArray.length}`
    );
  }

  // Check 3: Confidence threshold
  if (confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
    reasons.push(
      `OCR confidence too low: ${confidence}% (minimum: ${MINIMUM_CONFIDENCE_THRESHOLD}%)`
    );
  }

  // Check 4: Medical keyword validation
  const keywordMatches = extractedText.match(MEDICAL_KEYWORD_REGEX) || [];
  const uniqueKeywords = new Set(keywordMatches.map((k) => k.toLowerCase()));

  if (uniqueKeywords.size === 0) {
    reasons.push("No medical keywords detected (mg, tablet, etc.)");
  }

  // Check 5: Dosage pattern validation
  const dosageMatches = extractedText.match(DOSAGE_PATTERN) || [];
  if (dosageMatches.length === 0) {
    reasons.push("No dosage patterns detected (e.g., '500mg', '10ml')");
  }

  // Calculate confidence based on validations passed
  let validationScore = 0;
  const maxScore = 100;

  // Each validation is worth points
  if (extractedText && extractedText.trim().length > 0) validationScore += 20;
  if (medicinesArray && medicinesArray.length > 0) validationScore += 30;
  if (confidence >= MINIMUM_CONFIDENCE_THRESHOLD) validationScore += 15;
  if (uniqueKeywords.size > 0) validationScore += 20;
  if (dosageMatches.length > 0) validationScore += 15;

  results.confidence = Math.min(validationScore, maxScore);

  // Determine validity: must have extracted medicines and medical keywords
  results.isValid =
    medicinesArray && medicinesArray.length >= MINIMUM_MEDICINES_COUNT &&
    (uniqueKeywords.size > 0 || dosageMatches.length > 0) &&
    confidence >= MINIMUM_CONFIDENCE_THRESHOLD;

  return results;
};

/**
 * Express middleware for OCR validation
 * Validates medical content after OCR extraction
 * 
 * Expects: (req as any).ocrResult with extracted medicines
 * Next: Continues if valid, returns error if invalid
 */
export const ocrValidationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get OCR result from upstream middleware
    const ocrResult = (req as any).ocrResult;

    // If no OCR result, let downstream handle it
    if (!ocrResult) {
      return next();
    }

    const rawText = ocrResult.full_text || "";
    const medicines = ocrResult.medicines || [];
    const confidence = Number(ocrResult.accuracy || ocrResult.confidence || 100);

    // Validate medical content
    const validation = validateMedicalContent(rawText, medicines, confidence);

    // Store validation result for downstream usage
    (req as any).ocrValidation = validation;

    // If invalid, reject early
    if (!validation.isValid) {
      const reason = validation.reasons.join("; ");
      console.warn(
        `[OCR Validation] Invalid prescription: ${reason}`,
        { confidence: validation.confidence, medicinesCount: medicines.length }
      );

      return next(
        new ApiError(
          400,
          `Invalid prescription or non-medical image detected. Reason: ${reason}`
        )
      );
    }

    // Valid medical content, proceed
    console.debug(
      `[OCR Validation] Medical content validated`,
      { confidence: validation.confidence, medicinesCount: medicines.length }
    );

    next();
  } catch (error) {
    console.error("[OCR Validation] Middleware error:", error);
    // Don't fail on middleware error, let downstream handle it
    next();
  }
};

/**
 * Optional: Strict validation middleware
 * Logs warnings for low-confidence results but still proceeds
 */
export const ocrValidationStrictMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const ocrResult = (req as any).ocrResult;

    if (!ocrResult) {
      return next();
    }

    const rawText = ocrResult.full_text || "";
    const medicines = ocrResult.medicines || [];
    const confidence = Number(ocrResult.accuracy || ocrResult.confidence || 100);

    const validation = validateMedicalContent(rawText, medicines, confidence);

    (req as any).ocrValidation = validation;

    if (validation.confidence < 75) {
      console.warn(
        `[OCR Validation - Strict] Low confidence prescription`,
        { confidence: validation.confidence, reasons: validation.reasons }
      );
    }

    next();
  } catch (error) {
    console.error("[OCR Validation - Strict] Middleware error:", error);
    next();
  }
};

/**
 * Export validation helper for testing/logging
 */
export const getMedicalKeywordStats = (text: string) => {
  const keywords = {
    units: (text.match(
      new RegExp(`\\b(${MEDICAL_KEYWORDS.units.join("|")})\\b`, "gi")
    ) || []).length,
    formulations: (text.match(
      new RegExp(`\\b(${MEDICAL_KEYWORDS.formulations.join("|")})\\b`, "gi")
    ) || []).length,
    routes: (text.match(
      new RegExp(`\\b(${MEDICAL_KEYWORDS.routes.join("|")})\\b`, "gi")
    ) || []).length,
    frequencies: (text.match(
      new RegExp(`\\b(${MEDICAL_KEYWORDS.frequencies.join("|")})\\b`, "gi")
    ) || []).length,
  };

  return {
    total: Object.values(keywords).reduce((a, b) => a + b, 0),
    ...keywords,
  };
};
