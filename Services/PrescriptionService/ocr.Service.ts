/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR Service - Prescription image processing with Tesseract.          │
│  Extracts medicine details from prescription images using OCR.        │
└───────────────────────────────────────────────────────────────────────┘
*/


export interface MedicineDetails {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface VitalSign {
  parameter: string;
  value: string;
  status: string;
}

export interface PatientInfo {
  name: string;
  nic: string;
  gender: string;
  age: string;
  dob: string;
  bloodGroup: string;
  appointment: string;
}

export interface DoctorInfo {
  name: string;
  license: string;
  department: string;
}

export interface ClinicalFindings {
  diagnosis: string;
  symptoms: string;
}

export interface StructuredPrescription {
  patientInfo: PatientInfo;
  clinicalFindings: ClinicalFindings;
  vitalSigns: VitalSign[];
  medicines: MedicineDetails[];
  doctorInfo: DoctorInfo;
}

export interface OcrResult {
  text: string;
  medicines: MedicineDetails[];
  meta: {
    detectedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize OCR duration strings: "10day" → "10 days", "30days" → "30 days" */
function normalizeDuration(raw: string): string {
  const m = raw.match(/^(\d+)\s*(day|days|week|weeks|month|months)s?$/i);
  if (!m) return raw;
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase().replace(/s$/, "");
  return `${n} ${unit}${n !== 1 ? "s" : ""}`;
}

/** Normalize OCR frequency strings: "5for2" → "5 times, 2 per dose", "4for3" → "4 times, 3 per dose" */
function normalizeFrequency(raw: string): string {
  // e.g. "5for2", "10 for 3", "4 far 2"
  const m = raw.match(/^(\d+)\s*(?:for|far|x|times?)\s*(\d+)$/i);
  if (m) return `${m[1]} times, ${m[2]} per dose`;
  // standard text
  return raw;
}

/** Extract a field value after a label, from a line like "Name:Aayush Jain" */
function extractField(lines: string[], ...labels: string[]): string {
  for (const label of labels) {
    const line = lines.find((l) =>
      l.toLowerCase().startsWith(label.toLowerCase()),
    );
    if (line) {
      const value = line.substring(line.indexOf(":") + 1).trim();
      if (value && value.toLowerCase() !== "undefined") return value;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Pre-process
// ---------------------------------------------------------------------------

export function preprocessText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ") // Normalize multiple spaces to single space, but keep \n
    .replace(/[\n\r]+/g, "\n") // Normalize line breaks
    .trim();
}

// ---------------------------------------------------------------------------
// Full Structured Prescription Parser
// ---------------------------------------------------------------------------

export function parsePrescriptionText(rawText: string): StructuredPrescription {
  const text = preprocessText(rawText);
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // ── Patient Info ──────────────────────────────────────────────────────────
  const genderAgeLine = lines.find((l) => /Gender.?Age/i.test(l)) ?? "";
  const genderAgeVal = genderAgeLine.substring(genderAgeLine.indexOf(":") + 1).trim();
  const [genderPart = "", agePart = ""] = genderAgeVal.split("|").map((s) => s.trim());

  const patientInfo: PatientInfo = {
    name: extractField(lines, "Name:"),
    nic: extractField(lines, "NIC:"),
    gender: genderPart,
    age: agePart,
    dob: extractField(lines, "DOB:"),
    bloodGroup: extractField(lines, "Blood Group:"),
    appointment: extractField(lines, "Appointment:"),
  };

  // ── Clinical Findings ─────────────────────────────────────────────────────
  const diagIdx = lines.findIndex((l) => /^Diagnosis:/i.test(l));
  const sympIdx = lines.findIndex((l) => /^Symptoms:/i.test(l));

  let diagnosis = "";
  let symptoms = "";

  if (diagIdx !== -1) {
    // Value may be on same line or next line
    const inline = lines[diagIdx]!.replace(/^Diagnosis:/i, "").trim();
    diagnosis = inline || lines[diagIdx + 1] || "";
  }
  if (sympIdx !== -1) {
    const inline = lines[sympIdx]!.replace(/^Symptoms:/i, "").trim();
    if (inline) {
      symptoms = inline;
    } else {
      // Collect subsequent lines until next known section
      const collected: string[] = [];
      for (let i = sympIdx + 1; i < lines.length; i++) {
        const l = lines[i]!;
        if (/^(VITAL|PRESCRIPTION|Doctor|Parameter)/i.test(l)) break;
        collected.push(l);
      }
      symptoms = collected.join(", ");
    }
  }

  const clinicalFindings: ClinicalFindings = { diagnosis, symptoms };

  // ── Vital Signs ───────────────────────────────────────────────────────────
  const vitalSigns: VitalSign[] = [];
  const vitalStart = lines.findIndex((l) => /^VITAL\s*SIGNS?$/i.test(l));
  const vitalKnown = ["Blood Pressure", "Pulse Rate", "Temperature", "SpO2", "BMI"];

  if (vitalStart !== -1) {
    // After header lines (Parameter / Value / Status), parse triplets
    let i = vitalStart + 1;
    // Skip column headers
    while (i < lines.length && /^(Parameter|Value|Status)$/i.test(lines[i]!)) i++;

    while (i < lines.length) {
      const paramLine = lines[i]!;
      if (/^(PRESCRIPTION|Doctor|Medicine)$/i.test(paramLine)) break;

      // Check if this line is a known vital sign parameter
      const isVital = vitalKnown.some((v) =>
        paramLine.toLowerCase().startsWith(v.toLowerCase()),
      );
      if (isVital) {
        const value = lines[i + 1] ?? "";
        const status = lines[i + 2] ?? "";
        // Only push if next lines are not another parameter/section
        const nextIsParam = vitalKnown.some((v) =>
          (lines[i + 1] ?? "").toLowerCase().startsWith(v.toLowerCase()),
        );
        vitalSigns.push({
          parameter: paramLine,
          value: nextIsParam ? "" : value,
          status: nextIsParam ? "" : status,
        });
        i += nextIsParam ? 1 : 3;
      } else {
        i++;
      }
    }
  }

  // ── Medicines ─────────────────────────────────────────────────────────────
  const medicines = extractMedicinesFallback(text);
  // Also try regex if fallback found nothing
  const finalMedicines =
    medicines.length > 0 ? medicines : extractMedicinesWithRegex(text);

  // ── Doctor Info ───────────────────────────────────────────────────────────
  const doctorLine =
    lines.find((l) => /^Dr\.?\s/i.test(l) && l.length < 60) ?? "";
  const doctorInfo: DoctorInfo = {
    name: doctorLine || extractField(lines, "Doctor"),
    license: extractField(lines, "License:"),
    department: extractField(lines, "Department:"),
  };

  return { patientInfo, clinicalFindings, vitalSigns, medicines: finalMedicines, doctorInfo };
}

// ---------------------------------------------------------------------------
// Extract medicines using regex patterns
// ---------------------------------------------------------------------------

export function extractMedicinesWithRegex(text: string): MedicineDetails[] {
  const medicines: MedicineDetails[] = [];

  // Pattern 1: Prescription table format (Medicine | Duration | Instructions)
  // Matches: "Itracanazole 20 days 1 for 3" or "Ringguard 30 days 50 for 5"
  const tablePattern = /([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?)\s+[\d]+)/gi;

  let match;
  while ((match = tablePattern.exec(text)) !== null) {
    medicines.push({
      drugName: match[1]!.trim(),
      dosage: "Not specified",
      frequency: normalizeFrequency(match[3]!.trim()),
      duration: normalizeDuration(match[2]!.trim()),
    });
  }

  // Pattern 2: Standard format with dosage units (mg, ml, etc.)
  // Matches: "Aspirin 500mg twice daily for 7 days"
  if (medicines.length === 0) {
    const standardPattern =
      /([A-Za-z][A-Za-z ]{1,30}?)\s+(\d+\.?\d*\s*(?:mg|ml|units?))\s+((?:\d+\s*x\s*)?(?:once|twice|thrice|daily|twice daily|once daily))\s+(?:for\s+)?(\d+\s*(?:days?|weeks?|months?))/gi;

    while ((match = standardPattern.exec(text)) !== null) {
      const drugName = match[1]!.trim();
      if (/^(medicine|dosage|instructions|prescription|parameter|value|status)$/i.test(drugName)) continue;
      medicines.push({
        drugName,
        dosage: match[2]!.trim(),
        frequency: match[3]!.trim(),
        duration: normalizeDuration(match[4]!.trim()),
      });
    }
  }

  return medicines;
}

// ---------------------------------------------------------------------------
// Fallback extraction: scan lines for medicine keywords and patterns
// ---------------------------------------------------------------------------

export function extractMedicinesFallback(text: string): MedicineDetails[] {
  const medicines: MedicineDetails[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const SKIP_HEADERS = /^(Parameter|Value|Status|Medicine|Dosage|Instructions|PRESCRIPTION|VITAL|CLINICAL|PATIENT)$/i;
  let inPrescriptionSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!;

    // Detect prescription section start
    if (/^PRESCRIPTION$/i.test(trimmed)) {
      inPrescriptionSection = true;
      continue;
    }

    // Stop at Doctor's Signature
    if (/^Doctor.?s?\s+Signature/i.test(trimmed)) break;

    if (SKIP_HEADERS.test(trimmed)) continue;

    if (inPrescriptionSection) {
      // 1. Single-line: "Itracanazole 20 days 1 for 3"
      const singleLine = trimmed.match(
        /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+\s*(?:days?|weeks?|months?))\s+([\d\s]+(?:for|x|times?|far)\s*[\d]+)$/i,
      );
      if (singleLine) {
        medicines.push({
          drugName: singleLine[1]!.trim(),
          dosage: "Not specified",
          frequency: normalizeFrequency(singleLine[3]!.trim()),
          duration: normalizeDuration(singleLine[2]!.trim()),
        });
        continue;
      }

      // 2. Multi-line: Name → Duration → Frequency  (e.g., Paracetamol / 10day / 5for2)
      if (i + 2 < lines.length) {
        const possibleName = trimmed;
        const possibleDuration = lines[i + 1]!;
        const possibleFreq = lines[i + 2]!;

        const isDuration = /^\d+\s*(?:days?|weeks?|months?)$/i.test(possibleDuration);
        const isFreq = /^[\d\s]+(?:for|far|x|times?)\s*[\d]+$/i.test(possibleFreq);

        if (isDuration && isFreq && /^[A-Za-z][A-Za-z\s]{1,40}$/.test(possibleName)) {
          medicines.push({
            drugName: possibleName,
            dosage: "Not specified",
            duration: normalizeDuration(possibleDuration),
            frequency: normalizeFrequency(possibleFreq),
          });
          i += 2;
          continue;
        }
      }

      // 3. Has dosage unit on same line (mg, ml, etc.)
      const dosageMatch = trimmed.match(/(\d+\.?\d*\s*(?:mg|ml|units?))/i);
      if (dosageMatch) {
        const parts = trimmed.split(/\s+/);
        const drugName = parts
          .slice(0, parts.findIndex((w) => /\d+/.test(w)))
          .join(" ")
          .trim();
        if (drugName) {
          medicines.push({
            drugName,
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
// Extraction logic preserved for use by the backend resolution phase
