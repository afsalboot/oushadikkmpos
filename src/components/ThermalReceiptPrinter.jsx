"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import OushadhiLogo from "@/components/branding/OushadhiLogo";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateTime = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const paymentLabel = (sale) =>
  sale.payments?.map((payment) => payment.method).join(" + ") || "—";

function itemDescription(item) {
  if (item.saleMode === "WHOLESALE") {
    return `${item.orderedQuantity} ${item.wholesaleUnit || item.packageType} · ${item.paidQuantity} paid${item.freeQuantity ? ` + ${item.freeQuantity} FREE` : ""} · ${money(item.unitPrice)} / ${item.packageType}`;
  }
  if (item.saleMode === "LOOSE") {
    return `${item.baseQuantity} ${item.baseUnit || "units"} × ${money(item.unitPrice)}`;
  }
  if (item.saleMode === "MIX") {
    return (
      item.ingredients
        ?.map(
          (ingredient) =>
            `${ingredient.name} ${ingredient.baseQuantity} ${ingredient.baseUnit || "units"}`,
        )
        .join(" + ") || "Custom mixture"
    );
  }
  return `${item.quantity} ${item.packageType || "item"} × ${money(item.unitPrice)}`;
}

export function ThermalReceipt({ sale }) {
  const showGst = sale.gstEnabled && sale.showGstOnInvoice !== false;
  const detailed = showGst && sale.gstDisplayStyle !== "COMPACT";
  return (
    <div className="thermal-receipt">
      <header className="receipt-center">
        <div className="receipt-wordmark"><OushadhiLogo showPos={false} className="!text-black" /></div>
        {sale.storeSnapshot?.address && <p>{sale.storeSnapshot.address}</p>}
        {sale.storeSnapshot?.phone && <p>{sale.storeSnapshot.phone}</p>}
        {showGst && sale.storeSnapshot?.gstin && (
          <p><b>GSTIN: {sale.storeSnapshot.gstin}</b></p>
        )}
      </header>
      <div className="receipt-rule" />
      <dl className="receipt-meta">
        <div><dt>Invoice</dt><dd>{sale.invoiceNumber}</dd></div>
        <div><dt>Date</dt><dd>{dateTime(sale.createdAt)}</dd></div>
        <div><dt>Cashier</dt><dd>{sale.actorId?.name || sale.cashierSnapshot?.name || "Cashier"}</dd></div>
        <div>
          <dt>Customer</dt>
          <dd>{sale.customerSnapshot?.name || "Walk-in Customer"}</dd>
        </div>
        {sale.customerSnapshot?.doctorName && (
          <div><dt>Doctor</dt><dd>{sale.customerSnapshot.doctorName}</dd></div>
        )}
        <div><dt>Payment</dt><dd>{sale.paymentStatus === "UNPAID" ? "CREDIT" : paymentLabel(sale)}</dd></div>
      </dl>
      <div className="receipt-rule" />
      <div className="receipt-items">
        {sale.items?.map((item, index) => (
          <div className="receipt-item" key={index}>
            <strong>{item.name}</strong>
            {showGst && <small>HSN {item.hsnCode || "—"} · GST {item.gstRate || 0}%</small>}
            <div><span>{itemDescription(item)}</span><b>{money(item.total)}</b></div>
          </div>
        ))}
      </div>
      <div className="receipt-rule" />
      <dl className="receipt-totals">
        <div><dt>Subtotal</dt><dd>{money(sale.subtotal)}</dd></div>
        {Number(sale.discount || 0) > 0 && <div><dt>Discount</dt><dd>-{money(sale.discount)}</dd></div>}
        {showGst && (detailed ? <>
          <div><dt>Taxable Amount</dt><dd>{money(sale.taxableSubtotal)}</dd></div>
          {Number(sale.igst || 0) > 0 ? (
            <div><dt>IGST</dt><dd>{money(sale.igst)}</dd></div>
          ) : <>
            <div><dt>CGST</dt><dd>{money(sale.cgst)}</dd></div>
            <div><dt>SGST</dt><dd>{money(sale.sgst)}</dd></div>
          </>}
          <div><dt>Total GST</dt><dd>{money(sale.tax)}</dd></div>
        </> : <div><dt>GST</dt><dd>{money(sale.tax)}</dd></div>)}
        {Math.abs(Number(sale.roundOff || 0)) > 0.001 && <div><dt>Round Off</dt><dd>{money(sale.roundOff)}</dd></div>}
        <div className="receipt-grand"><dt>Grand Total</dt><dd>{money(sale.total)}</dd></div>
        {Number(sale.balanceDue || 0) > 0 && <>
          <div><dt>Amount Paid</dt><dd>{money(sale.amountPaid)}</dd></div>
          <div><dt>Balance Due</dt><dd>{money(sale.balanceDue)}</dd></div>
        </>}
      </dl>
      <div className="receipt-rule" />
      <footer className="receipt-center">
        <strong>Thank you for your purchase</strong>
        <p>വീണ്ടും സന്ദർശിക്കുക</p>
      </footer>
    </div>
  );
}

function printThermalReceipt(source, onFinished) {
  if (!source) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Thermal receipt print");
  Object.assign(frame.style, { position: "fixed", width: "0", height: "0", border: "0", right: "0", bottom: "0" });
  document.body.appendChild(frame);
  const documentRef = frame.contentDocument;
  documentRef.open();
  documentRef.write(`<!doctype html><html><head><title>Invoice Reprint</title><style>@font-face{font-family:OushadhiPrint;src:url("/fonts/UncialAntiqua-Regular.ttf") format("truetype");font-weight:400;font-style:normal}.receipt-wordmark{margin-bottom:6px}.oushadhi-logo{display:inline-flex;align-items:baseline;gap:7px;white-space:nowrap;color:#000}.oushadhi-logo__word{font-family:OushadhiPrint,serif;font-size:26px;font-weight:400;line-height:1.15;letter-spacing:-.035em}.oushadhi-logo__pos{font-family:Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.12em;color:#526b59}*{box-sizing:border-box}html,body{margin:0!important;padding:0!important;width:80mm;min-height:0!important;background:#fff;color:#000;font-family:Arial,sans-serif;overflow:visible}.thermal-receipt{display:block!important;position:static!important;width:80mm;max-width:80mm;height:auto!important;min-height:0!important;margin:0;padding:4mm 4mm 3mm;font-size:11px;line-height:1.35;overflow:visible;break-after:avoid;page-break-after:avoid}.receipt-center{text-align:center}.receipt-center h1{font-size:18px;line-height:1.1;margin:0 0 2px}.receipt-center p{margin:1px 0}.receipt-center small{display:block;margin-top:5px}.receipt-rule{border-top:1px dashed #000;margin:8px 0}.receipt-meta,.receipt-totals{margin:0}.receipt-meta div,.receipt-totals div,.receipt-item div{display:flex;justify-content:space-between;gap:8px}.receipt-meta dt,.receipt-totals dt{font-weight:400}.receipt-meta dd,.receipt-totals dd{margin:0;text-align:right;font-weight:700;overflow-wrap:anywhere}.receipt-item{margin:0 0 7px;break-inside:avoid}.receipt-item strong{display:block;margin-bottom:1px}.receipt-item span{max-width:50mm;overflow-wrap:anywhere}.receipt-item b{white-space:nowrap}.receipt-grand{font-size:14px;font-weight:700;border-top:1px solid #000;margin-top:5px;padding-top:5px}</style></head><body>${source.innerHTML}</body></html>`);
  documentRef.close();
  frame.onload = async () => {
    try { await documentRef.fonts.load('400 26px "OushadhiPrint"'); await documentRef.fonts.ready; } catch { /* Use the serif fallback if the font cannot be loaded. */ }
    const target = frame.contentWindow;
    const receipt = documentRef.querySelector(".thermal-receipt");
    const renderedHeight = receipt?.getBoundingClientRect().height || receipt?.scrollHeight || 0;
    const pageHeight = Math.max(60, Math.min(500, Math.ceil(renderedHeight * 25.4 / 96) + 1));
    const pageStyle = documentRef.createElement("style");
    pageStyle.textContent = `@page{size:80mm ${pageHeight}mm;margin:0}html,body{height:${pageHeight}mm!important;overflow:hidden!important}`;
    documentRef.head.appendChild(pageStyle);
    target.focus();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (document.body.contains(frame)) frame.remove();
      onFinished?.();
    };
    target.onafterprint = finish;
    target.print();
    setTimeout(finish, 30000);
  };
}

export default function ReceiptPrintButton({ sale, label = "Reprint Invoice", className = "btn btn-primary", iconOnly = false }) {
  const [printing, setPrinting] = useState(false);
  const sourceRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!printing || !sourceRef.current || startedRef.current) return;
    startedRef.current = true;
    printThermalReceipt(sourceRef.current, () => {
      startedRef.current = false;
      setPrinting(false);
    });
  }, [printing]);

  return <>
    <button
      type="button"
      className={className}
      disabled={printing}
      aria-label={iconOnly ? `${label} ${sale.invoiceNumber}` : undefined}
      title={iconOnly ? label : undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setPrinting(true);
      }}
    >
      <Printer size={16} />
      {!iconOnly && (printing ? "Preparing…" : label)}
    </button>
    {printing && <div ref={sourceRef} className="hidden" aria-hidden="true"><ThermalReceipt sale={sale} /></div>}
  </>;
}
