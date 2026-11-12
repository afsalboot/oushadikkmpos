"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { gstStateName } from "@/lib/gst-states";
import { receiptDiscountLabel } from "@/lib/receipt-discount";
import { receiptDocument } from "@/lib/receipt-appearance";

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
    timeZone: "Asia/Kolkata",
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
  const registered =
    sale.registrationSnapshot?.status === "REGULAR" ||
    sale.registrationSnapshot?.status === "COMPOSITION" ||
    showGst;
  return (
    <div className="thermal-receipt">
      <header className="receipt-center">
        <h1>
          {/* A plain image is copied into the isolated print document. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="receipt-logo"
            src="/oushadhi-receipt-logo-v2.png"
            alt="Oushadhi"
            loading="eager"
          />
        </h1>
        {sale.documentStatus === "CANCELLED" && (
          <p>
            <b>CANCELLED — {sale.cancellationReason}</b>
          </p>
        )}
        <p>Cheeran kurian complex,</p>
        <p>Pattambi road, Kunnamkulam</p>
        <p>04885 223973, 9526532437</p>
        {registered && sale.storeSnapshot?.gstin && (
          <p>
            <b>GSTIN: {sale.storeSnapshot.gstin}</b>
          </p>
        )}
      </header>
      <div className="receipt-rule" />
      <dl className="receipt-meta">
        <div>
          <dt>Invoice</dt>
          <dd>{sale.invoiceNumber}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dateTime(sale.invoiceDate || sale.createdAt)}</dd>
        </div>
        <div>
          <dt>Cashier</dt>
          <dd>
            {sale.cashierSnapshot?.name || sale.actorId?.name || "Cashier"}
          </dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{sale.customerSnapshot?.name || "Walk-in Customer"}</dd>
        </div>
        {(sale.customerSnapshot?.billingAddress ||
          sale.customerSnapshot?.address) && (
          <div>
            <dt>Bill to</dt>
            <dd>
              {sale.customerSnapshot.billingAddress ||
                sale.customerSnapshot.address}
            </dd>
          </div>
        )}
        {sale.customerSnapshot?.gstin && (
          <div>
            <dt>Customer GSTIN</dt>
            <dd>{sale.customerSnapshot.gstin}</dd>
          </div>
        )}
        {registered && sale.storeSnapshot?.stateCode && (
          <div>
            <dt>Supplier state</dt>
            <dd>
              {gstStateName(sale.storeSnapshot.stateCode)} (
              {sale.storeSnapshot.stateCode})
            </dd>
          </div>
        )}
        {sale.customerSnapshot?.stateCode && (
          <div>
            <dt>Recipient state</dt>
            <dd>
              {gstStateName(sale.customerSnapshot.stateCode)} (
              {sale.customerSnapshot.stateCode})
            </dd>
          </div>
        )}
        {registered && (
          <div>
            <dt>Place of supply</dt>
            <dd>
              {gstStateName(sale.placeOfSupply)} ({sale.placeOfSupply})
            </dd>
          </div>
        )}
        {(sale.supplyContext?.deliveryAddress ||
          sale.customerSnapshot?.shippingAddress) && (
          <div>
            <dt>Deliver to</dt>
            <dd>
              {sale.supplyContext?.deliveryAddress ||
                sale.customerSnapshot.shippingAddress}
            </dd>
          </div>
        )}
        {registered && (
          <div>
            <dt>Reverse charge</dt>
            <dd>No</dd>
          </div>
        )}
        {sale.originalInvoiceNumber && (
          <div>
            <dt>Original invoice</dt>
            <dd>{sale.originalInvoiceNumber}</dd>
          </div>
        )}
        {sale.reason && (
          <div>
            <dt>Reason</dt>
            <dd>{sale.reason}</dd>
          </div>
        )}
        {sale.customerSnapshot?.doctorName && (
          <div>
            <dt>Doctor</dt>
            <dd>{sale.customerSnapshot.doctorName}</dd>
          </div>
        )}
        <div>
          <dt>Payment</dt>
          <dd>
            {sale.paymentStatus === "UNPAID" ? "CREDIT" : paymentLabel(sale)}
          </dd>
        </div>
      </dl>
      <div className="receipt-rule" />
      <div className="receipt-items">
        {sale.items?.map((item, index) => (
          <div className="receipt-item" key={index}>
            <strong>{item.name}</strong>
            {item.saleMode !== "WHOLESALE" && Number(item.freeQuantity) > 0 && <small>Free: {item.freeQuantity} {item.saleMode === "LOOSE" ? item.baseUnit : item.packageType} (no charge)</small>}
            {Number(item.wholesaleDiscountPercent) > 0 && (
              <small>Wholesale discount ({item.wholesaleDiscountPercent}%): {money(item.wholesaleDiscountAmount)} (included in price)</small>
            )}
            {registered && (
              <small>
                HSN {item.hsnCode || "Not recorded"}
                {showGst && ` · GST ${item.gstRate || 0}%`}
              </small>
            )}
            {Number(item.discount) > 0 && (
              <small>Discount: {money(item.discount)}</small>
            )}
            {showGst && (
              <small>
                Taxable: {money(item.taxableValue)} ·{" "}
                {sale.taxType === "IGST" ? (
                  <>
                    IGST {item.igstRate ?? item.gstRate}%: {money(item.igst)}
                  </>
                ) : (
                  <>
                    CGST {item.cgstRate ?? Number(item.gstRate || 0) / 2}%:{" "}
                    {money(item.cgst)} ·{" "}
                    {sale.taxType === "CGST_UTGST" ? "UTGST" : "SGST"}{" "}
                    {item.sgstRate ||
                      item.utgstRate ||
                      Number(item.gstRate || 0) / 2}
                    %:{" "}
                    {money(
                      sale.taxType === "CGST_UTGST" ? item.utgst : item.sgst,
                    )}
                  </>
                )}
              </small>
            )}
            <div>
              <span>{itemDescription(item)}</span>
              <b>{money(item.total)}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-rule" />
      <dl className="receipt-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{money(sale.subtotal)}</dd>
        </div>
        {Number(sale.discount || 0) > 0 && (
          <div>
            <dt>{receiptDiscountLabel(sale)}</dt>
            <dd>-{money(sale.discount)}</dd>
          </div>
        )}
        {showGst &&
          (detailed ? (
            <>
              <div>
                <dt>Taxable Amount</dt>
                <dd>{money(sale.taxableSubtotal)}</dd>
              </div>
              {Number(sale.igst || 0) > 0 ? (
                <div>
                  <dt>IGST</dt>
                  <dd>{money(sale.igst)}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>CGST</dt>
                    <dd>{money(sale.cgst)}</dd>
                  </div>
                  <div>
                    <dt>{sale.taxType === "CGST_UTGST" ? "UTGST" : "SGST"}</dt>
                    <dd>
                      {money(
                        sale.taxType === "CGST_UTGST" ? sale.utgst : sale.sgst,
                      )}
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt>Total GST</dt>
                <dd>{money(sale.tax)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>GST</dt>
              <dd>{money(sale.tax)}</dd>
            </div>
          ))}
        {Number(sale.consultationFee || 0) > 0 && <div><dt>Consultation fee</dt><dd>{money(sale.consultationFee)}</dd></div>}
        {Number(sale.treatmentFee || 0) > 0 && <div><dt>Treatment fee</dt><dd>{money(sale.treatmentFee)}</dd></div>}
        {Math.abs(Number(sale.roundOff || 0)) > 0.001 && (
          <div>
            <dt>Round Off</dt>
            <dd>{money(sale.roundOff)}</dd>
          </div>
        )}
        <div className="receipt-grand">
          <dt>Grand Total</dt>
          <dd>{money(sale.total)}</dd>
        </div>
        {Number(sale.balanceDue || 0) > 0 && (
          <>
            <div>
              <dt>Amount Paid</dt>
              <dd>{money(sale.amountPaid)}</dd>
            </div>
            <div>
              <dt>Balance Due</dt>
              <dd>{money(sale.balanceDue)}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="receipt-rule" />
      <footer className="receipt-center">
        {sale.registrationSnapshot?.status === "COMPOSITION" && (
          <p>
            Composition taxable person, not eligible to collect tax on supplies.
          </p>
        )}
        {registered && (
          <p style={{ marginTop: 18 }}>
            Authorised signature: __________________
          </p>
        )}
        <strong>Thank you for your purchase</strong>
        <p>വീണ്ടും സന്ദർശിക്കുക</p>
        <div className="receipt-cut-space" aria-hidden="true">
          <span className="receipt-end-mark" />
        </div>
      </footer>
    </div>
  );
}

export async function printThermalReceipt(source, onFinished, receiptSnapshot) {
  if (!source) return;
  let receipt = receiptSnapshot || { width: source.querySelector("[data-receipt-width]")?.dataset.receiptWidth || "80mm" };
  if (!receiptSnapshot) try {
    const response = await fetch("/api/settings/receipt", { cache: "no-store" });
    if (response.ok) receipt = (await response.json()).data.receipt;
  } catch { /* Keep the document's last known width when offline. */ }
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Thermal receipt print");
  Object.assign(frame.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    right: "0",
    bottom: "0",
  });
  document.body.appendChild(frame);
  const documentRef = frame.contentDocument;
  documentRef.open();
  // Keep content inside a conservative 72 mm print area on an 80 mm roll.
  // The printed end mark keeps trailing-blank trimming from removing this gap.
  documentRef.write(
    receiptDocument(source.innerHTML, receipt),
  );
  documentRef.close();
  frame.onload = async () => {
    try {
      await documentRef.fonts.load('400 26px "OushadhiPrint"');
      await documentRef.fonts.ready;
    } catch {
      /* Use the serif fallback if the font cannot be loaded. */
    }
    await Promise.all(
      Array.from(documentRef.images, async (image) => {
        try {
          await image.decode();
        } catch {
          /* The alt text identifies the store if the logo fails to load. */
        }
      }),
    );
    const target = frame.contentWindow;
    const pageStyle = documentRef.createElement("style");
    // A shorter custom page can be centred on the printer's selected sheet.
    // Use that sheet size and let the receipt flow from its top edge.
    pageStyle.textContent =
      "@page{size:auto;margin:0}html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important}";
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

export default function ReceiptPrintButton({
  sale,
  label = "Reprint Invoice",
  className = "btn btn-primary",
  iconOnly = false,
}) {
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

  return (
    <>
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
      {printing && (
        <div ref={sourceRef} className="hidden" aria-hidden="true">
          <ThermalReceipt sale={sale} />
        </div>
      )}
    </>
  );
}
