"use client";

import { CheckCircle2, LoaderCircle, ScanBarcode, TriangleAlert } from "lucide-react";

export default function ScannerStatus({ status = "ready", message }) {
  if (status === "ready" && !message) return null;
  const config = {
    ready: [ScanBarcode, "Barcode scanner ready", "text-[var(--muted)]"],
    scanning: [LoaderCircle, "Scanning…", "text-[var(--green)]"],
    found: [CheckCircle2, "Product found", "text-emerald-700"],
    error: [TriangleAlert, "Product not found", "text-amber-700"],
  }[status] || [ScanBarcode, "Barcode scanner ready", "text-[var(--muted)]"];
  const [Icon, fallback, tone] = config;
  return <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${tone}`} role="status"><Icon className={status === "scanning" ? "loading-shimmer-icon" : ""} size={14}/>{message || fallback}</span>;
}
