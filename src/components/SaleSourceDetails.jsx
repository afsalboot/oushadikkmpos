"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OushadhiLogo from "@/components/branding/OushadhiLogo";
import { ArrowLeft, LoaderCircle, ReceiptText } from "lucide-react";
import { toast } from "sonner";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export default function SaleSourceDetails({ id }) {
  const [sale, setSale] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/sales/${id}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        return json.data;
      })
      .then((result) => active && setSale(result))
      .catch((failure) => {
        if (active) {
          setError(failure.message);
          toast.error(failure.message);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);
  if (loading)
    return (
      <div className="card grid min-h-72 place-items-center">
        <LoaderCircle className="loading-shimmer-icon text-[var(--green)]" />
      </div>
    );
  if (error)
    return (
      <div className="card grid min-h-72 place-items-center p-8 text-center">
        <div>
          <ReceiptText className="mx-auto text-[var(--red)]" />
          <h1 className="mt-4 text-xl font-extrabold">Unable to load sale</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
          <Link href="/sales/recent" className="btn mt-4">
            Back to Recent Sales
          </Link>
        </div>
      </div>
    );
  return (
    <>
      <div className="mb-4">
        <OushadhiLogo />
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/sales/recent"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--green)]"
          >
            <ArrowLeft size={16} />
            Back to Recent Sales
          </Link>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Sale source record
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">{sale.invoiceNumber}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Completed {date(sale.createdAt)} by{" "}
            {sale.actorId?.name || sale.cashierSnapshot?.name || "Cashier"}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-bold text-[var(--muted)]">Invoice total</p>
          <p className="mt-1 text-3xl font-extrabold text-[var(--green)]">
            {money(sale.total)}
          </p>
        </div>
      </div>
      <section className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Mode</th>
                <th>Quantity</th>
                {sale.gstEnabled && <th>GST</th>}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => (
                <tr key={`${item.productId || item.name}-${index}`}>
                  <td>
                    <strong>{item.name}</strong>
                    {sale.gstEnabled && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        HSN {item.hsnCode || "—"}
                      </p>
                    )}
                    {item.ingredients?.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {item.ingredients.map((entry) => entry.name).join(", ")}
                      </p>
                    )}
                  </td>
                  <td>{item.saleMode}</td>
                  <td>
                    {item.quantity} {item.baseUnit || ""}
                  </td>
                  {sale.gstEnabled && (
                    <td>
                      {item.gstRate || 0}%
                      <small className="block text-[var(--muted)]">
                        {money(item.taxAmount || item.totalTax)}
                      </small>
                    </td>
                  )}
                  <td>
                    <strong>{money(item.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="space-y-5">
          <section className="card p-5">
            <p className="label">Customer</p>
            <h2 className="text-lg font-extrabold">
              {sale.customerSnapshot?.name || "Walk-in Customer"}
            </h2>
            {sale.customerSnapshot?.phone && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {sale.customerSnapshot.phone}
              </p>
            )}
          </section>
          <section className="card p-5">
            <p className="label">Payment breakdown</p>
            <div className="mt-3 space-y-3">
              {sale.payments.map((payment, index) => (
                <div
                  className="flex items-center justify-between"
                  key={`${payment.method}-${index}`}
                >
                  <div>
                    <strong>{payment.method}</strong>
                    {payment.reference && (
                      <p className="text-xs text-[var(--muted)]">
                        {payment.reference}
                      </p>
                    )}
                  </div>
                  <strong>{money(payment.amount)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="card p-5 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-[var(--muted)]">Subtotal</span>
              <strong>{money(sale.subtotal)}</strong>
            </div>
            {Number(sale.discount || 0) > 0 && (
              <div className="flex justify-between py-1 text-[var(--green)]">
                <span>Discount</span>
                <strong>-{money(sale.discount)}</strong>
              </div>
            )}
            {sale.gstEnabled && (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--muted)]">Taxable amount</span>
                  <strong>{money(sale.taxableSubtotal)}</strong>
                </div>
                {sale.taxType === "IGST" || Number(sale.igst) > 0 ? (
                  <div className="flex justify-between py-1">
                    <span className="text-[var(--muted)]">IGST</span>
                    <strong>{money(sale.igst)}</strong>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between py-1">
                      <span className="text-[var(--muted)]">CGST</span>
                      <strong>{money(sale.cgst)}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[var(--muted)]">SGST</span>
                      <strong>{money(sale.sgst)}</strong>
                    </div>
                  </>
                )}
              </>
            )}
            {Math.abs(Number(sale.roundOff || 0)) > 0.001 && (
              <div className="flex justify-between py-1">
                <span className="text-[var(--muted)]">Round off</span>
                <strong>{money(sale.roundOff)}</strong>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-[var(--line)] pt-3 text-lg">
              <strong>Grand total</strong>
              <strong>{money(sale.total)}</strong>
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
