/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR Service - Prescription image processing with Tesseract.          │
│  Extracts medicine details from prescription images using OCR.        │
└───────────────────────────────────────────────────────────────────────┘
*/
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "node-tesseract-ocr";
const TEMP_DIR = path.join(process.cwd(), "temp_uploads");
// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    }
    catch (error) {
        console.error("Failed to create temp directory:", error);
    }
}
// Preprocess text: normalize whitespace and remove extra characters
function preprocessText(text) {
    return text
        .replace(/\s+/g, " ") // Normalize multiple spaces to single space
        .replace(/[\n\r]+/g, "\n") // Normalize line breaks
        .trim();
}
// Extract medicines using regex pattern with prescription keywords
function extractMedicinesWithRegex(text) {
    const medicines = [];
    // Pattern 1: Prescription table format (Medicine | Dosage | Instructions)
    // Matches: "Itracanazole 20 days 1 for 3" or "Ringguard 30 days 50 for 5"
    const tablePattern = /([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?)\s+[\d]+)/gi;
    let match;
    while ((match = tablePattern.exec(text)) !== null) {
        medicines.push({
            drugName: match[1].trim(),
            dosage: "Not specified",
            frequency: match[3].trim(),
            duration: match[2].trim(),
        });
    }
    // Pattern 2: Standard format with dosage units (mg, ml, etc.)
    // Matches: "Aspirin 500mg 2x daily for 7 days"
    if (medicines.length === 0) {
        const standardPattern = /([A-Za-z\s]+?)\s+(\d+\.?\d*\s*(?:mg|ml|units?))\s+(\d+\s*x\s*daily|once|twice|thrice|daily|twice daily|once daily)\s+(?:for\s+)?(\d+\s*(?:days?|weeks?|months?))/gi;
        while ((match = standardPattern.exec(text)) !== null) {
            medicines.push({
                drugName: match[1].trim(),
                dosage: match[2].trim(),
                frequency: match[3].trim(),
                duration: match[4].trim(),
            });
        }
    }
    return medicines;
}
// Fallback extraction: scan lines for medicine keywords and patterns
function extractMedicinesFallback(text) {
    const medicines = [];
    const lines = text.split("\n");
    // Keywords that indicate prescription section
    const prescriptionKeywords = ["PRESCRIPTION", "Medicine", "Dosage", "Instructions"];
    const isPrescriptionSection = (lineText) => prescriptionKeywords.some((kw) => lineText.includes(kw));
    let inPrescriptionSection = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // Detect prescription section start
        if (isPrescriptionSection(trimmed)) {
            inPrescriptionSection = true;
            continue;
        }
        // Skip table headers or empty rows
        if (trimmed.match(/^(Parameter|Value|Status|Medicine|Dosage|Instructions)$/i)) {
            continue;
        }
        // Extract medicine from prescription section
        if (inPrescriptionSection && trimmed.length > 0) {
            // Match: "medicineName duration frequency"
            // E.g., "Itracanazole 20 days 1 for 3"
            const medicineMatch = trimmed.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?)\s+[\d]+)$/i);
            if (medicineMatch) {
                medicines.push({
                    drugName: medicineMatch[1].trim(),
                    dosage: "Not specified",
                    frequency: medicineMatch[3].trim(),
                    duration: medicineMatch[2].trim(),
                });
                continue;
            }
            // Fallback: match any line with dosage units (mg, ml, etc.)
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
                        dosage: dosageMatch[1].trim(),
                        frequency: "Not specified",
                        duration: "Not specified",
                    });
                }
            }
        }
    }
    return medicines;
}
export async function processPrescriptionBuffer(buffer) {
    await ensureTempDir();
    const tempFileName = `prescription_${uuidv4()}.png`;
    const tempFilePath = path.join(TEMP_DIR, tempFileName);
    try {
        // Write buffer to temporary file
        await fs.writeFile(tempFilePath, buffer);
        // Run Tesseract OCR
        const ocrText = await Tesseract.recognize(tempFilePath, {
            lang: "eng",
            psm: 6,
            oem: 1,
        });
        // Preprocess text
        const preprocessedText = preprocessText(ocrText);
        // Extract medicines using regex
        let medicines = extractMedicinesWithRegex(preprocessedText);
        // Fallback: if no matches, try line-by-line extraction
        if (medicines.length === 0) {
            medicines = extractMedicinesFallback(preprocessedText);
        }
        return {
            text: preprocessedText,
            medicines,
            meta: {
                detectedCount: medicines.length,
            },
        };
    }
    finally {
        // Always delete temporary file
        try {
            await fs.unlink(tempFilePath);
        }
        catch (error) {
            console.error(`Failed to delete temp file ${tempFilePath}:`, error);
        }
    }
}
