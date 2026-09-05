"use client";

import { useEffect, useRef } from "react";

export default function BarcodeScannerListener({ onScan, enabled = true, allowInModal = false }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "", startedAt = 0, lastAt = 0;
    const reset = () => {
      buffer = "";
      startedAt = 0;
      lastAt = 0;
    };
    const keydown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const target = event.target,
        editable = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)),
        barcodeField = target instanceof HTMLElement && target.dataset.barcodeInput === "true",
        now = performance.now();
      if (!allowInModal && document.querySelector('[role="dialog"][aria-modal="true"]')) return reset();
      if (editable && !barcodeField) return reset();
      if (event.key === "Enter") {
        const averageGap = buffer.length > 1 ? (now - startedAt) / (buffer.length - 1) : Infinity;
        if (buffer.length >= 6 && averageGap <= 55 && now - lastAt <= 100) {
          event.preventDefault();
          onScanRef.current?.(buffer);
        }
        return reset();
      }
      if (event.key.length !== 1) return;
      if (!buffer || now - lastAt > 100) {
        buffer = event.key;
        startedAt = now;
      } else buffer += event.key;
      lastAt = now;
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [allowInModal, enabled]);

  return null;
}
