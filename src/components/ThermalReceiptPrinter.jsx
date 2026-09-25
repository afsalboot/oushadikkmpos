"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import {gstStateName} from "@/lib/gst-states";

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
    timeZone:"Asia/Kolkata",
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
  const showGst = Boolean(sale.gstEnabled);
  const detailed = showGst;
  const registered=sale.registrationSnapshot?.status==="REGULAR"||sale.registrationSnapshot?.status==="COMPOSITION"||showGst;
  return (
    <div className="thermal-receipt">
      <header className="receipt-center">
        <h1>
          {/* A plain image is copied into the isolated print document. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="receipt-logo" src="/oushadhi-receipt-logo.png" alt="Oushadhi" loading="eager" />
        </h1>
        {sale.documentStatus==="CANCELLED"&&<p><b>CANCELLED — {sale.cancellationReason}</b></p>}
        <p>Cheeran kurian complex,</p>
        <p>Pattambi road, kunnakulam</p>
        <p>04885 223973, 9526532437</p>
        {registered && sale.storeSnapshot?.gstin && (
          <p><b>GSTIN: {sale.storeSnapshot.gstin}</b></p>
        )}
      </header>
      <div className="receipt-rule" />
      <dl className="receipt-meta">
        <div><dt>Invoice</dt><dd>{sale.invoiceNumber}</dd></div>
        <div><dt>Date</dt><dd>{dateTime(sale.invoiceDate||sale.createdAt)}</dd></div>
        <div><dt>Cashier</dt><dd>{sale.cashierSnapshot?.name || sale.actorId?.name || "Cashier"}</dd></div>
        <div>
          <dt>Customer</dt>
          <dd>{sale.customerSnapshot?.name || "Walk-in Customer"}</dd>
        </div>
        {(sale.customerSnapshot?.billingAddress||sale.customerSnapshot?.address)&&<div><dt>Bill to</dt><dd>{sale.customerSnapshot.billingAddress||sale.customerSnapshot.address}</dd></div>}
        {sale.customerSnapshot?.gstin&&<div><dt>Customer GSTIN</dt><dd>{sale.customerSnapshot.gstin}</dd></div>}
        {registered&&sale.storeSnapshot?.stateCode&&<div><dt>Supplier state</dt><dd>{gstStateName(sale.storeSnapshot.stateCode)} ({sale.storeSnapshot.stateCode})</dd></div>}
        {sale.customerSnapshot?.stateCode&&<div><dt>Recipient state</dt><dd>{gstStateName(sale.customerSnapshot.stateCode)} ({sale.customerSnapshot.stateCode})</dd></div>}
        {registered&&<div><dt>Place of supply</dt><dd>{gstStateName(sale.placeOfSupply)} ({sale.placeOfSupply})</dd></div>}
        {(sale.supplyContext?.deliveryAddress||sale.customerSnapshot?.shippingAddress)&&<div><dt>Deliver to</dt><dd>{sale.supplyContext?.deliveryAddress||sale.customerSnapshot.shippingAddress}</dd></div>}
        {registered&&<div><dt>Reverse charge</dt><dd>No</dd></div>}
        {sale.originalInvoiceNumber&&<div><dt>Original invoice</dt><dd>{sale.originalInvoiceNumber}</dd></div>}
        {sale.reason&&<div><dt>Reason</dt><dd>{sale.reason}</dd></div>}
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
            {registered&&<small>HSN {item.hsnCode||"Not recorded"}{showGst&&` · GST ${item.gstRate||0}%`}</small>}
            {Number(item.discount)>0&&<small>Discount: {money(item.discount)}</small>}
            {showGst&&<small>Taxable: {money(item.taxableValue)} · {sale.taxType==="IGST"?<>IGST {item.igstRate??item.gstRate}%: {money(item.igst)}</>:<>CGST {item.cgstRate??Number(item.gstRate||0)/2}%: {money(item.cgst)} · {sale.taxType==="CGST_UTGST"?"UTGST":"SGST"} {item.sgstRate||item.utgstRate||Number(item.gstRate||0)/2}%: {money(sale.taxType==="CGST_UTGST"?item.utgst:item.sgst)}</>}</small>}
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
            <div><dt>{sale.taxType==="CGST_UTGST"?"UTGST":"SGST"}</dt><dd>{money(sale.taxType==="CGST_UTGST"?sale.utgst:sale.sgst)}</dd></div>
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
        {sale.registrationSnapshot?.status==="COMPOSITION"&&<p>Composition taxable person, not eligible to collect tax on supplies.</p>}
        {registered&&<p style={{marginTop:18}}>Authorised signature: __________________</p>}
        <strong>Thank you for your purchase</strong>
        <p>വീണ്ടും സന്ദർശിക്കുക</p>
        <div className="receipt-cut-space" aria-hidden="true" />
      </footer>
    </div>
  );
}

export function printThermalReceipt(source, onFinished) {
  if (!source) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Thermal receipt print");
  Object.assign(frame.style, { position: "fixed", width: "0", height: "0", border: "0", right: "0", bottom: "0" });
  document.body.appendChild(frame);
  const documentRef = frame.contentDocument;
  documentRef.open();
  // Keep content inside a conservative 72 mm print area on an 80 mm roll.
  // Reserve a real block after the footer for paper feed before the cut.
  documentRef.write(`<!doctype html><html><head><title>Invoice Reprint</title><style>@font-face{font-family:OushadhiPrint;src:url("/fonts/UncialAntiqua-Regular.ttf") format("truetype");font-weight:400;font-style:normal}.receipt-wordmark{margin-bottom:6px}.oushadhi-logo{display:inline-flex;align-items:baseline;gap:7px;white-space:nowrap;color:#000}.oushadhi-logo__word{font-family:OushadhiPrint,serif;font-size:26px;font-weight:400;line-height:1.15;letter-spacing:-.035em}.oushadhi-logo__pos{font-family:Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.12em;color:#526b59}*{box-sizing:border-box}html,body{margin:0!important;padding:0!important;width:100%;max-width:80mm;min-height:0!important;background:#fff;color:#000;font-family:Arial,sans-serif;overflow:visible}.thermal-receipt{display:block!important;position:static!important;width:72mm;max-width:100%;height:auto!important;min-height:0!important;margin:0;padding:0 2mm;font-size:11px;line-height:1.35;overflow:visible;break-after:avoid;page-break-after:avoid}.receipt-logo{display:block;width:62mm;max-width:100%;height:auto;margin:0 auto 3mm}.receipt-center{text-align:center;overflow-wrap:anywhere}footer.receipt-center{break-inside:avoid;page-break-inside:avoid}.receipt-cut-space{display:block!important;height:18mm!important;min-height:18mm!important;flex:none;break-inside:avoid;page-break-inside:avoid}.receipt-center h1{font-size:18px;line-height:1.1;margin:0 0 2px}.receipt-center p{margin:1px 0}.receipt-center small{display:block;margin-top:5px}.receipt-rule{border-top:1px dashed #000;margin:8px 0}.receipt-meta,.receipt-totals{margin:0}.receipt-meta div,.receipt-totals div,.receipt-item div{display:flex;justify-content:space-between;gap:8px}.receipt-meta dt,.receipt-totals dt{font-weight:400;flex:0 0 auto}.receipt-meta dd,.receipt-totals dd{margin:0;min-width:0;flex:1;text-align:right;font-weight:700;overflow-wrap:anywhere}.receipt-item{margin:0 0 7px;break-inside:avoid}.receipt-item strong{display:block;margin-bottom:1px}.receipt-item span{min-width:0;flex:1;max-width:50mm;overflow-wrap:anywhere}.receipt-item b{flex:0 0 auto;white-space:nowrap}.receipt-grand{font-size:14px;font-weight:700;border-top:1px solid #000;margin-top:5px;padding-top:5px}</style></head><body>${source.innerHTML}</body></html>`);
  documentRef.close();
  frame.onload = async () => {
    try { await documentRef.fonts.load('400 26px "OushadhiPrint"'); await documentRef.fonts.ready; } catch { /* Use the serif fallback if the font cannot be loaded. */ }
    await Promise.all(Array.from(documentRef.images, async (image) => {
      try { await image.decode(); } catch { /* The alt text identifies the store if the logo fails to load. */ }
    }));
    const target = frame.contentWindow;
    const pageStyle = documentRef.createElement("style");
    // A shorter custom page can be centred on the printer's selected sheet.
    // Use that sheet size and let the receipt flow from its top edge.
    pageStyle.textContent = "@page{size:auto;margin:0}html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important}";
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
