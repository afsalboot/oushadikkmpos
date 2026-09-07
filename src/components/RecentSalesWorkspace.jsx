"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  WalletCards,
  X,
} from "lucide-react";
import ReceiptPrintButton from "@/components/ThermalReceiptPrinter";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const iso = (value) => {
  const year = value.getFullYear(),
    month = String(value.getMonth() + 1).padStart(2, "0"),
    day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const emptyFilters = {
  dateFrom: "",
  dateTo: "",
  paymentMethod: "",
  saleMode: "",
};

function saleType(sale) {
  const modes = [
    ...new Set(
      (sale.items || [])
        .map((item) => (item.saleMode === "MIX" ? "MIX" : item.saleMode))
        .filter(Boolean),
    ),
  ];
  return modes.length > 1 ? "MIXED" : modes[0] || "SALE";
}

function paymentLabel(sale) {
  return sale.paymentStatus === "UNPAID"
    ? "CREDIT"
    : sale.payments
        ?.map((payment) => payment.method)
        .filter(Boolean)
        .join(" + ") || "—";
}

function Kpi({ label, value, note, icon: Icon }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-extrabold">{value}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
          <Icon size={19} />
        </span>
      </div>
    </div>
  );
}

export default function RecentSalesWorkspace() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [filters, setFilters] = useState(emptyFilters),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useMemo(() => {
    const parameters = new URLSearchParams({
      view: "recent",
      page: String(page),
      limit: "20",
    });
    if (debounced) parameters.set("q", debounced);
    Object.entries(filters).forEach(
      ([key, value]) => value && parameters.set(key, value),
    );
    return parameters.toString();
  }, [debounced, filters, page]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => active && setLoading(true));
    fetch(`/api/sales?${query}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        return json.data;
      })
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((failure) => active && setError(failure.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query]);
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  function today() {
    const value = iso(new Date());
    setFilters({ ...emptyFilters, dateFrom: value, dateTo: value });
    setPage(1);
  }
  function lastSevenDays() {
    const end = new Date(),
      start = new Date();
    start.setDate(end.getDate() - 6);
    setFilters({ ...emptyFilters, dateFrom: iso(start), dateTo: iso(end) });
    setPage(1);
  }
  function clear() {
    setSearch("");
    setDebounced("");
    setFilters(emptyFilters);
    setPage(1);
  }
  const hasFilters = Boolean(debounced || Object.values(filters).some(Boolean)),
    summary = data?.summary || {};
  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/sales"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--green)]"
          >
            <ArrowLeft size={16} />
            Back to Sales
          </Link>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Sales history
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Recent Sales</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Search completed invoices and open their full sale details.
          </p>
        </div>
        <Link href="/sales" className="btn btn-primary">
          <Plus size={17} />
          New sale
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Invoices"
          value={summary.invoices || 0}
          note="Current filters"
          icon={ReceiptText}
        />
        <Kpi
          label="Revenue"
          value={money(summary.revenue)}
          note="Paid sales"
          icon={WalletCards}
        />
        <Kpi
          label="Average bill"
          value={money(summary.averageBill)}
          note="Revenue per invoice"
          icon={ShoppingCart}
        />
        <Kpi
          label="Items sold"
          value={summary.items || 0}
          note="Invoice line items"
          icon={CalendarDays}
        />
      </section>
      <section className="card mt-5 p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-3.5 text-[var(--muted)]"
            size={18}
          />
          <input
            className="field !pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice, customer, phone, or cashier..."
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn !min-h-9" onClick={today}>
            Today
          </button>
          <button className="btn !min-h-9" onClick={lastSevenDays}>
            Last 7 days
          </button>
          <button className="btn !min-h-9" onClick={clear}>
            All sales
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label>
            <span className="label">From</span>
            <input
              className="field"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
            />
          </label>
          <label>
            <span className="label">To</span>
            <input
              className="field"
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
            />
          </label>
          <label>
            <span className="label">Payment</span>
            <select
              className="field"
              value={filters.paymentMethod}
              onChange={(event) =>
                updateFilter("paymentMethod", event.target.value)
              }
            >
              <option value="">All payments</option>
              {["CASH", "UPI", "CARD", "BANK"].map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Sale type</span>
            <select
              className="field"
              value={filters.saleMode}
              onChange={(event) => updateFilter("saleMode", event.target.value)}
            >
              <option value="">All sale types</option>
              <option value="PACKAGE">Package</option>
              <option value="LOOSE">Loose</option>
              <option value="MIX">Custom mix</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="btn w-full"
              disabled={!hasFilters}
              onClick={clear}
            >
              <X size={16} />
              Clear filters
            </button>
          </div>
        </div>
      </section>
      {error ? (
        <section className="card mt-5 grid min-h-72 place-items-center p-8 text-center">
          <div>
            <ReceiptText className="mx-auto text-[var(--red)]" />
            <h2 className="mt-4 text-lg font-extrabold">
              Unable to load recent sales
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
          </div>
        </section>
      ) : loading ? (
        <section className="card mt-5 p-5">
          <div className="space-y-4">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                className="h-14 loading-shimmer rounded-xl bg-slate-100"
                key={index}
              />
            ))}
          </div>
        </section>
      ) : data?.sales?.length ? (
        <>
          <section className="card table-wrap mt-5 hidden lg:block">
            <table>
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Payment</th>
                  <th>Cashier</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((sale) => (
                  <tr key={sale._id}>
                    <td className="whitespace-nowrap">
                      {dateTime(sale.createdAt)}
                    </td>
                    <td className="font-extrabold">{sale.invoiceNumber}</td>
                    <td>{sale.customerSnapshot?.name || "Walk-in Customer"}</td>
                    <td>
                      <span className="rounded-full bg-[var(--green-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--green)]">
                        {saleType(sale)}
                      </span>
                    </td>
                    <td>{sale.items?.length || 0}</td>
                    <td>{paymentLabel(sale)}</td>
                    <td>
                      {sale.actorId?.name ||
                        sale.cashierSnapshot?.name ||
                        "Cashier"}
                    </td>
                    <td className="font-extrabold">{money(sale.total)}</td>
                    <td>
                      <div className="flex gap-2">
                        <ReceiptPrintButton
                          sale={sale}
                          label="Reprint Invoice"
                          className="inline-grid size-9 place-items-center rounded-lg border border-[var(--line)] hover:bg-slate-50"
                          iconOnly
                        />
                        <Link
                          href={`/sales/${sale._id}`}
                          className="inline-grid size-9 place-items-center rounded-lg border border-[var(--line)] hover:bg-slate-50"
                          aria-label={`View ${sale.invoiceNumber}`}
                        >
                          <ArrowRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="mt-5 space-y-3 lg:hidden">
            {data.sales.map((sale) => (
              <article className="card p-4" key={sale._id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{sale.invoiceNumber}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {sale.customerSnapshot?.name || "Walk-in Customer"}
                    </p>
                  </div>
                  <strong>{money(sale.total)}</strong>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 text-xs text-[var(--muted)]">
                  <span>
                    {dateTime(sale.createdAt)}
                    <br />
                    {paymentLabel(sale)} · {sale.items?.length || 0} items
                  </span>
                  <div className="flex gap-2">
                    <ReceiptPrintButton
                      sale={sale}
                      label="Reprint Invoice"
                      className="btn !min-h-9 !px-3"
                      iconOnly
                    />
                    <Link
                      href={`/sales/${sale._id}`}
                      className="btn !min-h-9 !px-3"
                      aria-label={`View ${sale.invoiceNumber}`}
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </section>
          <div className="mt-5 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
            <p className="text-[var(--muted)]">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
              {Math.min(
                data.pagination.page * data.pagination.limit,
                data.pagination.total,
              )}{" "}
              of {data.pagination.total} sales
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn !min-h-9"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="px-2 font-bold">
                {page} / {data.pagination.pages}
              </span>
              <button
                className="btn !min-h-9"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <section className="card mt-5 grid min-h-72 place-items-center p-8 text-center">
          <div>
            <ReceiptText className="mx-auto text-[var(--green)]" size={36} />
            <h2 className="mt-4 text-lg font-extrabold">
              {hasFilters ? "No matching sales" : "No completed sales yet"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {hasFilters
                ? "Try changing your search or filters."
                : "Completed sales will appear here automatically."}
            </p>
            {hasFilters && (
              <button className="btn mt-4" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
