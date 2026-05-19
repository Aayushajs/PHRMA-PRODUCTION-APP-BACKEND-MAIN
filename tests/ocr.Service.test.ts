import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractMedicinesFallback,
  extractMedicinesWithRegex,
  parsePrescriptionText,
} from "../Services/PrescriptionService/ocr.Service";

describe("ocr.Service parsing", () => {
  it("extractMedicinesFallback preserves alphanumeric medicine names on dosage lines", () => {
    const result = extractMedicinesFallback(
      [
        "PRESCRIPTION",
        "Vitamin B12 500mg twice daily",
        "Doctor's Signature",
      ].join("\n"),
    );

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      drugName: "Vitamin B12",
      dosage: "500mg",
      frequency: "Not specified",
      duration: "Not specified",
    });
  });

  it("extractMedicinesWithRegex matches alphanumeric medicine names", () => {
    const result = extractMedicinesWithRegex(
      "Vitamin B12 500mg twice daily for 7 days",
    );

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      drugName: "Vitamin B12",
      dosage: "500mg",
      frequency: "twice daily",
      duration: "7 days",
    });
  });

  it("parsePrescriptionText extracts structured prescription fields and multiline medicine names", () => {
    const result = parsePrescriptionText(
      [
        "Name: Aayush Jain",
        "NIC: 123456789V",
        "Gender/Age: Male | 32",
        "DOB: 1994-05-10",
        "Blood Group: O+",
        "Appointment: 2026-05-19",
        "Diagnosis: Seasonal allergy",
        "Symptoms:",
        "Sneezing",
        "Itchy eyes",
        "PRESCRIPTION",
        "Vitamin B12",
        "10day",
        "5for2",
        "Doctor's Signature",
      ].join("\n"),
    );

    assert.deepEqual(result.patientInfo, {
      name: "Aayush Jain",
      nic: "123456789V",
      gender: "Male",
      age: "32",
      dob: "1994-05-10",
      bloodGroup: "O+",
      appointment: "2026-05-19",
    });

    assert.deepEqual(result.clinicalFindings, {
      diagnosis: "Seasonal allergy",
      symptoms: "Sneezing, Itchy eyes",
    });

    assert.deepEqual(result.medicines, [
      {
        drugName: "Vitamin B12",
        dosage: "Not specified",
        frequency: "5 times, 2 per dose",
        duration: "10 days",
      },
    ]);
  });
});
