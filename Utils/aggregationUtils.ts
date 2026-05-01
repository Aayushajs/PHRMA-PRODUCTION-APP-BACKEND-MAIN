import crypto from "crypto";
import mongoose from "mongoose";

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

const buildMedicineHash = (medicines: Array<{ name: string }>): string =>
  crypto
    .createHash("md5")
    .update(
      medicines
        .map((medicine) => normalize(medicine.name))
        .filter(Boolean)
        .sort()
        .join("|"),
    )
    .digest("hex");

const toObjectId = (value: string | mongoose.Types.ObjectId) =>
  typeof value === "string" ? new mongoose.Types.ObjectId(value) : value;

const normalizeAvailability = (value: unknown): "in_stock" | "out_of_stock" | "limited" | "pre_order" => {
  if (value === true || value === "true") return "in_stock";
  if (value === false || value === "false") return "out_of_stock";
  if (value === "limited" || value === "pre_order" || value === "out_of_stock" || value === "in_stock") {
    return value as any;
  }
  return "out_of_stock";
};

const medicineNames = (medicine: any): string[] => {
  const names = [medicine?.medicineName, medicine?.genericName, medicine?.brand];
  if (Array.isArray(medicine?.synonyms)) {
    names.push(...medicine.synonyms);
  }
  return names.filter(Boolean).map((item) => normalize(String(item)));
};

const matchesMedicine = (source: string, candidate: any): boolean => {
  const normalizedSource = normalize(source);
  return medicineNames(candidate).some(
    (candidateName) => candidateName.includes(normalizedSource) || normalizedSource.includes(candidateName),
  );
};

const normalizeMedicineName = (value: string): string => normalize(value);

export {
  normalize,
  buildMedicineHash,
  toObjectId,
  normalizeAvailability,
  medicineNames,
  matchesMedicine,
  normalizeMedicineName,
};
