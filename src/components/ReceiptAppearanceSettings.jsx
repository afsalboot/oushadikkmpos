"use client";

import { useId, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { printThermalReceipt } from "./ThermalReceiptPrinter";
import { RECEIPT_FONTS, receiptAppearanceErrors, receiptDocument } from "@/lib/receipt-appearance";
import { receiptLayout } from "@/lib/receipt-layout";

// Fixed sample content keeps test prints independent of sales and stock.
const SAMPLE_RECEIPT = `<div class="thermal-receipt">
  <header class="receipt-center">
    <h1><img class="receipt-logo" src="/oushadhi-receipt-logo-v2.png" alt="Oushadhi"></h1>
    <p>Cheeran kurian complex,</p><p>Pattambi road, Kunnamkulam</p><p>04885 223973, 9526532437</p>
    <p><b>TEST PRINT — SAMPLE ONLY</b></p>
  </header>
  <div class="receipt-rule"></div>
  <dl class="receipt-meta"><div><dt>Invoice</dt><dd>SAMPLE-001</dd></div><div><dt>Customer</dt><dd>Walk-in Customer</dd></div><div><dt>Payment</dt><dd>CASH</dd></div></dl>
  <div class="receipt-rule"></div>
  <div class="receipt-items"><div class="receipt-item"><strong>Sample product</strong><div><span>2 pcs × ₹30.00</span><b>₹60.00</b></div></div></div>
  <div class="receipt-rule"></div>
  <dl class="receipt-totals"><div><dt>Subtotal</dt><dd>₹60.00</dd></div><div class="receipt-grand"><dt>Grand Total</dt><dd>₹60.00</dd></div></dl>
  <div class="receipt-rule"></div>
  <footer class="receipt-center"><strong>Thank you for your purchase</strong><p>വീണ്ടും സന്ദർശിക്കുക</p><p>No sale recorded</p><div class="receipt-cut-space"><span class="receipt-end-mark"></span></div></footer>
</div>`;

export default function ReceiptAppearanceSettings({ receipt, change, errors, disabled }) {
  const id = useId();
  const source = useRef(null);
  const [printing, setPrinting] = useState(false);
  const font = receipt.font ?? "ARIAL";
  const intensity = receipt.intensity ?? 0;
  const invalid = Object.keys(receiptAppearanceErrors({ font, intensity })).length > 0;

  async function testPrint() {
    setPrinting(true);
    try {
      await printThermalReceipt(source.current, () => setPrinting(false), receipt);
    } catch {
      setPrinting(false);
      toast.error("Unable to prepare the test receipt. Try again.");
    }
  }

  return (
    <section className="card mb-5 p-4 sm:p-6" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="text-lg font-extrabold">Font & print intensity</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">Adjust letters and logos for your receipt paper.</p>
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <div>
            <label className="label" htmlFor={`${id}-font`}>Receipt font</label>
            <select id={`${id}-font`} className="field" value={font} disabled={disabled} onChange={event => change("receipt.font", event.target.value)} aria-describedby={`${id}-font-note`} aria-invalid={Boolean(errors["receipt.font"])}>
              {RECEIPT_FONTS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <p id={`${id}-font-note`} className="mt-2 text-xs text-[var(--muted)]">Changes receipt text. The Oushadhi logo keeps its original lettering.</p>
            {errors["receipt.font"] && <p className="mt-1 text-xs font-bold text-red-600" role="alert">{errors["receipt.font"]}</p>}
          </div>
          <div>
            <label className="label" htmlFor={`${id}-intensity`}>Print intensity</label>
            <div className="flex items-center gap-3">
              <input id={`${id}-intensity`} type="range" min="0" max="100" step="1" value={intensity} disabled={disabled} onChange={event => change("receipt.intensity", Number(event.target.value))} aria-describedby={`${id}-intensity-note`} aria-valuetext={`${intensity}% extra intensity`} className="h-11 min-w-0 flex-1 cursor-pointer accent-[var(--green)] disabled:cursor-not-allowed" />
              <label className="flex shrink-0 items-center gap-1">
                <span className="sr-only">Print intensity percentage</span>
                <input type="number" min="0" max="100" step="1" value={intensity} disabled={disabled} onChange={event => change("receipt.intensity", Number(event.target.value))} aria-describedby={`${id}-intensity-note`} aria-invalid={Boolean(errors["receipt.intensity"])} className="field w-20 tabular-nums" />
                <span aria-hidden="true">%</span>
              </label>
            </div>
            <div className="flex justify-between text-xs text-[var(--muted)]" aria-hidden="true"><span>0% · Original</span><span>100% · Strongest</span></div>
            <p id={`${id}-intensity-note`} className="mt-3 text-xs text-[var(--muted)]">Higher values thicken black letters and logo strokes. Start at 25% and test on your paper. This adjusts the artwork; use printer preferences for thermal heat or density.</p>
            {errors["receipt.intensity"] && <p className="mt-1 text-xs font-bold text-red-600" role="alert">{errors["receipt.intensity"]}</p>}
          </div>
          <button type="button" className="btn" disabled={printing || invalid} onClick={testPrint}><Printer size={16} aria-hidden="true" />{printing ? "Preparing…" : "Print test receipt"}</button>
          <p className="text-xs text-[var(--muted)]">Test prints use these selections without saving. Choose Save Changes to use them on sales and reprints.</p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-bold">Sample preview</p>
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2">
            <iframe title="Receipt appearance preview" sandbox="allow-same-origin" srcDoc={receiptDocument(SAMPLE_RECEIPT, receipt)} className="mx-auto block max-w-full border-0 bg-white" style={{ width: `${receiptLayout(receipt).paper}mm`, height: 440 }} />
          </div>
        </div>
      </div>
      <div className="hidden" aria-hidden="true" ref={source} dangerouslySetInnerHTML={{ __html: SAMPLE_RECEIPT }} />
    </section>
  );
}
