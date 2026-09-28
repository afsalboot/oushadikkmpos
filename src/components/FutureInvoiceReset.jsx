"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "./ConfirmDialog";

async function request(options) {
  const response = await fetch("/api/settings/invoice-reset", { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to reset invoice numbering");
  return body.data;
}

export default function FutureInvoiceReset({ disabled, onReset }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function reset() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const preview = await request();
      if (!await confirm({
        title: "Restart future invoice numbers from 1?",
        description: `The next sale will start at 001 using its date and time, for example ${preview.nextInvoiceNumber}. Regular and wholesale sales share this sequence. Existing invoice numbers, sales and payments will stay unchanged.`,
        confirmText: "Reset to 1",
        cancelText: "Cancel",
      })) return;
      const saved = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: preview.token, confirmation: "RESET FUTURE INVOICES" }) });
      setResult(saved);
      toast.success(`Numbering restarted. Next invoice: ${saved.nextInvoiceNumber}`);
      await onReset();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="card mt-5 p-5 sm:p-6" aria-labelledby="future-invoice-reset-title">
    <h3 id="future-invoice-reset-title" className="text-lg font-extrabold">Reset invoice / receipt number</h3>
    <p className="mt-2 text-sm text-[var(--muted)]">Start the next sale from 001 using INV-DateTime-001. Existing invoices keep their original numbers.</p>
    {disabled && <p className="mt-3 text-sm text-amber-800">Save or discard your Settings changes before resetting.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--red)]">{error}</p>}
    {result && <p role="status" className="mt-3 text-sm text-[var(--green)]">Reset complete. Next invoice format: <strong>{result.nextInvoiceNumber}</strong>.</p>}
    <button type="button" className="btn mt-4" disabled={disabled || busy} onClick={reset}><RotateCcw size={16} />{busy ? "Please wait..." : "Reset future numbering to 1"}</button>
  </section>;
}
