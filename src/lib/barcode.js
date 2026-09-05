export const BARCODE_TYPES = ["EAN13", "EAN8", "UPCA", "UPCE", "CODE128", "CODE39", "QR"];

export function normalizeBarcode(value) {
  const barcode = String(value ?? "").trim();
  return barcode || undefined;
}

export function detectBarcodeType(value) {
  const barcode = normalizeBarcode(value) || "";
  if (!barcode) return "EAN13";
  if (/^\d{13}$/.test(barcode)) return "EAN13";
  if (/^\d{12}$/.test(barcode)) return "UPCA";
  if (/^\d{8}$/.test(barcode)) return "EAN8";
  if (/^[A-Z0-9 .$/+%-]+$/i.test(barcode)) return "CODE39";
  return "CODE128";
}

export function validateBarcode(value) {
  const barcode = normalizeBarcode(value);
  if (!barcode) return [];
  const errors = [];
  if (/\s/.test(barcode)) errors.push("Barcode must not contain spaces");
  if (barcode.length < 4) errors.push("Barcode must contain at least 4 characters");
  if (barcode.length > 128) errors.push("Barcode must not exceed 128 characters");
  if (!/^[\x21-\x7E]+$/.test(barcode)) errors.push("Barcode contains unsupported characters");
  return errors;
}

export function looksLikeBarcode(value) {
  const barcode = normalizeBarcode(value) || "";
  return /^\d{6,18}$/.test(barcode) || /^POS-[A-Z0-9-]{4,}$/i.test(barcode);
}
