"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import ReceiptPrintButton from "@/components/ThermalReceiptPrinter";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const paymentLabel = (sale) =>
  sale.payments?.map((payment) => payment.method).join(" + ") || "—";
function itemDescription(item) {
  if (item.saleMode === "WHOLESALE")
    return `${item.orderedQuantity} ${item.wholesaleUnit || item.packageType} · ${item.paidQuantity} paid${item.freeQuantity ? ` + ${item.freeQuantity} FREE` : ""} · ${money(item.unitPrice)} / ${item.packageType}`;
  if (item.saleMode === "LOOSE")
    return `${item.baseQuantity} ${item.baseUnit || "units"} × ${money(item.unitPrice)}`;
  if (item.saleMode === "MIX")
    return (
      item.ingredients
        ?.map(
          (ingredient) =>
            `${ingredient.name} ${ingredient.baseQuantity} ${ingredient.baseUnit || "units"}`,
        )
        .join(" + ") || "Custom mixture"
    );
  return `${item.quantity} ${item.packageType || "item"} × ${money(item.unitPrice)}`;
}

export default function SalesSuccessHost() {
  const [sale, setSale] = useState(null);
  useEffect(() => {
    const show = (event) => setSale(event.detail?.sale || null);
    window.addEventListener("oushadi-sale-success", show);
    return () => window.removeEventListener("oushadi-sale-success", show);
  }, []);
  if (!sale) return null;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4">
      <section
        className="sales-success-dialog card relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-title"
      >
        <button
          className="absolute right-5 top-5 z-10 text-white"
          onClick={() => setSale(null)}
          aria-label="Close success"
        >
          <X />
        </button>
        <header className="sales-success-header shrink-0 bg-[var(--green)] px-6 pb-6 pt-7 text-center text-white">
          <span className="success-check" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
          </span>
          <h2 id="success-title" className="mt-4 text-2xl font-extrabold">
            Payment Successful
          </h2>
          <p className="mt-1 text-sm text-emerald-100">
            Invoice {sale.invoiceNumber}
          </p>
          <p className="mt-3 text-4xl font-extrabold">{money(sale.total)}</p>
        </header>
        <div className="sales-success-body flex min-h-0 flex-1 flex-col p-6">
          <div className="grid shrink-0 grid-cols-2 gap-3 rounded-xl bg-[#f4f7f3] p-4 text-sm">
            <div>
              <small className="text-[var(--muted)]">Customer</small>
              <strong className="block">
                {sale.customerSnapshot?.name || "Walk-in Customer"}
              </strong>
              {sale.customerSnapshot?.doctorName && (
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Doctor: {sale.customerSnapshot.doctorName}
                </span>
              )}
            </div>
            <div>
              <small className="text-[var(--muted)]">Payment</small>
              <strong className="block">{paymentLabel(sale)}</strong>
            </div>
          </div>
          <div
            className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y pr-2"
            role="region"
            aria-label="Purchased products"
            tabIndex={0}
          >
            {sale.items?.map((item, index) => (
              <div className="flex justify-between gap-4 py-3" key={index}>
                <span className="min-w-0">
                  <strong className="block truncate">{item.name}</strong>
                  <small className="block text-[var(--muted)]">
                    {itemDescription(item)}
                  </small>
                </span>
                <strong className="shrink-0">{money(item.total)}</strong>
              </div>
            ))}
          </div>
          <div className="mt-3 flex shrink-0 justify-between border-t-2 border-[var(--ink)] pt-4 text-xl">
            <strong>Total paid</strong>
            <strong>{money(sale.total)}</strong>
          </div>
        </div>
        <footer className="grid shrink-0 grid-cols-2 gap-3 border-t bg-white p-5">
          <button className="btn" onClick={() => setSale(null)}>
            New Sale
          </button>
          <ReceiptPrintButton sale={sale} label="Print Thermal Receipt" />
        </footer>
      </section>
    </div>
  );
}
