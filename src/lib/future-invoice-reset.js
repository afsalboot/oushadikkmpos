import { formatDocumentDateTime } from "../services/document-number.service.js";
import { requestHash } from "./fiscal-integrity.js";

export function planFutureInvoiceReset({ invoice = {}, value = new Date() } = {}) {
  const prefix = String(invoice.prefix || "INV").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(prefix)) throw new Error("Invoice prefix must contain 1 to 3 letters or digits");
  return {
    prefix,
    counterKey: `INVOICE:TIMESTAMP:${prefix}`,
    nextInvoiceNumber: `${prefix}-${formatDocumentDateTime(value)}-001`,
    resetVersion: Number(invoice.resetVersion || 0) + 1,
    token: requestHash({ invoice, prefix, format: "DATETIME" }),
  };
}
