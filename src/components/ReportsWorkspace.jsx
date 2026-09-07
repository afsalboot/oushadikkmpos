"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  FileBarChart,
  PackageOpen,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { serializedFilterEntries } from "@/lib/filter-utils";
import MultiSelectFilter from "@/components/MultiSelectFilter";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
const iso = (value) => {
  const year = value.getFullYear(),
    month = String(value.getMonth() + 1).padStart(2, "0"),
    day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const reportGroups = [
  {
    label: "Overview",
    items: [
      {
        id: "overview",
        label: "Overview",
        description: "Business performance at a glance",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        id: "sales",
        label: "Sales Report",
        description: "Revenue, invoices and sale activity",
        icon: ShoppingCart,
      },
      {
        id: "wholesale-sales",
        label: "Wholesale Sales",
        description: "Wholesale revenue, paid/free quantities and stock out",
        icon: Boxes,
      },
      {
        id: "product-sales",
        label: "Product Sales",
        description: "Retail, loose, mix and wholesale performance",
        icon: FileBarChart,
      },
      {
        id: "payment-methods",
        label: "Payment Methods",
        description: "Correct split-payment attribution",
        icon: WalletCards,
      },
      {
        id: "loose-sales",
        label: "Loose Sales",
        description: "ml, g, tablet and piece sales",
        icon: PackageOpen,
      },
      {
        id: "custom-mix",
        label: "Custom Mix",
        description: "Mixtures sold and composition",
        icon: FileBarChart,
      },
      {
        id: "mix-ingredients",
        label: "Mix Ingredients",
        description: "Ingredient consumption in mixtures",
        icon: Boxes,
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        id: "inventory",
        label: "Current Inventory",
        description: "Physical package and base stock",
        icon: Boxes,
      },
      {
        id: "inventory-valuation",
        label: "Inventory Valuation",
        description: "Known batch cost and selling value",
        icon: FileBarChart,
      },
      {
        id: "low-stock",
        label: "Low Stock",
        description: "Products requiring reorder",
        icon: PackageOpen,
      },
      {
        id: "batches",
        label: "Batch Inventory",
        description: "Batch-level physical stock",
        icon: Boxes,
      },
      {
        id: "expiry",
        label: "Expiry",
        description: "Expired and expiring batches",
        icon: PackageOpen,
      },
      {
        id: "opened-stock",
        label: "Opened Stock",
        description: "Current loose/open quantities",
        icon: PackageOpen,
      },
      {
        id: "stock-movement",
        label: "Stock Movement",
        description: "Complete inventory audit trail",
        icon: FileBarChart,
      },
      {
        id: "stock-adjustments",
        label: "Stock Adjustments",
        description: "Inventory discrepancy audit",
        icon: FileBarChart,
      },
    ],
  },
  {
    label: "Purchases",
    items: [
      {
        id: "purchases",
        label: "Purchase Report",
        description: "Received supplier purchases",
        icon: ShoppingCart,
      },
      {
        id: "suppliers",
        label: "Supplier Purchases",
        description: "Spend and outstanding by supplier",
        icon: Users,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        id: "expenses",
        label: "Expenses",
        description: "Manual and purchase-linked register",
        icon: WalletCards,
      },
      {
        id: "cash-flow",
        label: "Cash Flow",
        description: "Money in, money out and channels",
        icon: WalletCards,
      },
      {
        id: "gross-profit",
        label: "Gross Profit",
        description: "Revenue, COGS and gross margin",
        icon: FileBarChart,
      },
    ],
  },
  {
    label: "Customers & Staff",
    items: [
      {
        id: "customers",
        label: "Customers",
        description: "Spend, loyalty and customer type",
        icon: Users,
      },
      {
        id: "staff",
        label: "Staff Activity",
        description: "Employee operational activity",
        icon: Users,
      },
    ],
  },
];
const allReports = reportGroups.flatMap((group) => group.items);

async function api(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Unable to load report");
  return json.data;
}
function presetRange(preset) {
  const now = new Date(),
    from = new Date(now),
    to = new Date(now);
  if (preset === "yesterday") {
    from.setDate(now.getDate() - 1);
    to.setDate(now.getDate() - 1);
  }
  if (preset === "7days") from.setDate(now.getDate() - 6);
  if (preset === "30days") from.setDate(now.getDate() - 29);
  if (preset === "month") from.setDate(1);
  if (preset === "lastMonth") {
    from.setMonth(now.getMonth() - 1, 1);
    to.setDate(0);
  }
  if (preset === "year") {
    from.setMonth(0, 1);
  }
  return { dateFrom: iso(from), dateTo: iso(to) };
}
function valueOf(row, column) {
  const value = row[column.key];
  if (column.type === "money") return money(value);
  if (column.type === "moneyNullable")
    return value === null || value === undefined
      ? "Cost unavailable"
      : money(value);
  if (column.type === "date") return date(value);
  if (column.unitKey && value !== null && value !== undefined)
    return `${value} ${row[column.unitKey] || ""}`;
  return value ?? "—";
}
function Kpis({ items = [] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => (
        <article className="card p-5" key={item.label}>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
            {item.label}
          </p>
          {item.type === "unavailable" ? (
            <>
              <p className="mt-3 font-extrabold text-[var(--muted)]">
                Cost data unavailable
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.note}</p>
            </>
          ) : (
            <p className="mt-3 text-2xl font-extrabold">
              {item.type === "money" ? money(item.value) : (item.value ?? 0)}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
function ChartCard({ title, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h2>
      <div className="mt-4 h-72">{children}</div>
    </section>
  );
}
function Overview({ data, openReport, allowed }) {
  const trend = data.charts?.trend || [],
    movement = data.charts?.movement || [];
  return (
    <>
      <Kpis items={data.kpis} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <ChartCard title="Sales Trend">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="reportGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1f6b45" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#1f6b45" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) => [
                  name === "revenue" ? money(value) : value,
                  name,
                ]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#1f6b45"
                fill="url(#reportGreen)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Business Movement">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={movement} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                dataKey="label"
                type="category"
                width={112}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(value) => money(value)} />
              <Bar dataKey="value" fill="#1f6b45" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <section className="mt-7">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Report library
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">
            Explore detailed reports
          </h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {allReports
            .filter(
              (item) => item.id !== "overview" && allowed.includes(item.id),
            )
            .map((item) => (
              <button
                className="card group p-5 text-left transition hover:-translate-y-0.5 hover:border-[#8cae98]"
                onClick={() => openReport(item.id)}
                key={item.id}
              >
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
                  <item.icon size={19} />
                </span>
                <h3 className="mt-5 font-extrabold">{item.label}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {item.description}
                </p>
                <span className="mt-5 flex items-center gap-2 text-sm font-extrabold text-[var(--green)]">
                  View report <ArrowRight size={15} />
                </span>
              </button>
            ))}
        </div>
      </section>
    </>
  );
}

export default function ReportsWorkspace() {
  const [report, setReport] = useState("overview"),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [preset, setPreset] = useState("30days"),
    [dates, setDates] = useState(() => presetRange("30days")),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState(""),
    [order, setOrder] = useState("desc"),
    [extra, setExtra] = useState({});
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useMemo(
    () =>
      new URLSearchParams({
        ...dates,
        search: debounced,
        page: String(page),
        limit: "25",
        sort,
        order,
        ...Object.fromEntries(serializedFilterEntries(extra)),
      }).toString(),
    [dates, debounced, page, sort, order, extra],
  );
  async function load() {
    setLoading(true);
    try {
      setData(await api(`/api/reports/${report}?${query}`));
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/api/reports/${report}?${query}`)
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
  }, [report, query]);
  function choosePreset(value) {
    setPreset(value);
    if (value !== "custom") setDates(presetRange(value));
    setPage(1);
  }
  function openReport(value) {
    setReport(value);
    setSearch("");
    setSort("");
    setExtra({});
    setPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function exportCsv() {
    try {
      const response = await fetch(
        `/api/reports/${report}?${query}&format=csv`,
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `oushadi-${report}-report.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported successfully.");
    } catch (failure) {
      toast.error(failure.message || "Unable to export report.");
    }
  }
  const allowed = data?.access?.allowed || ["overview"],
    selected = allReports.find((item) => item.id === report),
    pagination = data?.pagination || { page: 1, pages: 1, total: 0, limit: 25 };
  return (
    <div className="report-print">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Reporting & analytics
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">
            {data?.title || selected?.label || "Reports"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {data?.description ||
              "Analyze sales, inventory, purchases, expenses and business performance."}
          </p>
        </div>
        <div className="report-actions flex gap-2">
          {data?.access?.canExport && report !== "overview" && (
            <button className="btn" onClick={exportCsv}>
              <Download size={17} />
              Export CSV
            </button>
          )}
          <button className="btn" onClick={() => window.print()}>
            <Printer size={17} />
            Print
          </button>
        </div>
      </header>
      <section className="report-controls card mb-5 p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["7days", "7 Days"],
            ["30days", "30 Days"],
            ["month", "This Month"],
            ["lastMonth", "Last Month"],
            ["year", "This Year"],
            ["custom", "Custom"],
          ].map(([value, label]) => (
            <button
              className={`btn !min-h-9 shrink-0 ${preset === value ? "btn-primary" : ""}`}
              onClick={() => choosePreset(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">From</span>
              <input
                className="field"
                type="date"
                value={dates.dateFrom}
                onChange={(event) =>
                  setDates({ ...dates, dateFrom: event.target.value })
                }
              />
            </label>
            <label>
              <span className="label">To</span>
              <input
                className="field"
                type="date"
                value={dates.dateTo}
                onChange={(event) =>
                  setDates({ ...dates, dateTo: event.target.value })
                }
              />
            </label>
          </div>
        )}
      </section>
      <nav className="report-controls mb-5 flex gap-2 overflow-x-auto pb-2">
        {allReports
          .filter((item) => allowed.includes(item.id))
          .map((item) => (
            <button
              className={`btn shrink-0 ${report === item.id ? "btn-primary" : ""}`}
              onClick={() => openReport(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
      </nav>
      {error ? (
        <section className="card grid min-h-72 place-items-center p-8 text-center">
          <div>
            <FileBarChart className="mx-auto text-[var(--red)]" />
            <h2 className="mt-4 font-extrabold">
              Unable to load {selected?.label || "report"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            <button className="btn mt-4" onClick={load}>
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        </section>
      ) : loading ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                className="card h-28 loading-shimmer bg-slate-100"
                key={index}
              />
            ))}
          </section>
          <section className="card mt-5 h-80 loading-shimmer bg-slate-100" />
        </>
      ) : report === "overview" ? (
        <Overview data={data} openReport={openReport} allowed={allowed} />
      ) : (
        <>
          <Kpis items={data?.kpis} />
          {(data?.charts?.breakdown?.length ||
            data?.charts?.ranking?.length) && (
            <div className="mt-5">
              <ChartCard
                title={data.charts.ranking ? "Top Results" : "Breakdown"}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.charts.ranking || data.charts.breakdown}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey={
                        data.charts.ranking
                          ? "product"
                          : data.charts.breakdown[0]?.label !== undefined
                            ? "label"
                            : "method"
                      }
                      width={130}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) =>
                        typeof value === "number" ? money(value) : value
                      }
                    />
                    <Bar
                      dataKey={
                        data.charts.ranking
                          ? "revenue"
                          : data.charts.breakdown[0]?.value !== undefined
                            ? "value"
                            : "amount"
                      }
                      fill="#1f6b45"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
          <section className="report-controls card mt-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative">
                <Search
                  className="absolute left-3 top-3 text-[var(--muted)]"
                  size={18}
                />
                <input
                  className="field !pl-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search this report..."
                />
              </label>
              {report === "sales" && (
                <>
                  <MultiSelectFilter
                    label="Payment methods"
                    placeholder="All payment methods"
                    clearLabel="All payment methods"
                    values={extra.paymentMethod || []}
                    options={["CASH", "UPI", "CARD", "BANK"].map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(values) => {
                      setExtra({ ...extra, paymentMethod: values });
                      setPage(1);
                    }}
                  />
                  <MultiSelectFilter
                    label="Sale types"
                    placeholder="All sale types"
                    clearLabel="All sale types"
                    values={extra.saleType || []}
                    options={[
                      { value: "PACKAGE", label: "Package" },
                      { value: "LOOSE", label: "Loose" },
                      { value: "MIXTURE", label: "Mixture" },
                      { value: "MIXED", label: "Mixed invoice" },
                    ]}
                    onChange={(values) => {
                      setExtra({ ...extra, saleType: values });
                      setPage(1);
                    }}
                  />
                </>
              )}
              {report === "expenses" && (
                <MultiSelectFilter
                  label="Expense sources"
                  placeholder="All expense sources"
                  clearLabel="All expense sources"
                  values={extra.source || []}
                  options={[
                    { value: "MANUAL", label: "Manual" },
                    { value: "PURCHASE", label: "Purchase-linked" },
                  ]}
                  onChange={(values) => {
                    setExtra({ ...extra, source: values });
                    setPage(1);
                  }}
                />
              )}
              {report === "expiry" && (
                <MultiSelectFilter
                  label="Expiry ranges"
                  placeholder="All ≤ 90 days"
                  clearLabel="All ≤ 90 days"
                  values={extra.expiryRange || []}
                  options={[
                    { value: "expired", label: "Expired" },
                    { value: "30", label: "≤ 30 days" },
                    { value: "60", label: "≤ 60 days" },
                    { value: "90", label: "≤ 90 days" },
                  ]}
                  onChange={(values) => {
                    setExtra({ ...extra, expiryRange: values });
                    setPage(1);
                  }}
                />
              )}
              {data?.columns?.length > 0 && (
                <select
                  className="field"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Default sorting</option>
                  {data.columns.map((column) => (
                    <option value={column.key} key={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="field"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </section>
          {data?.rows?.length ? (
            <>
              <section className="card table-wrap mt-5 hidden lg:block">
                <table>
                  <thead>
                    <tr>
                      {data.columns.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, index) => (
                      <tr
                        key={
                          row.id ||
                          row.invoice ||
                          row.purchase ||
                          `${page}-${index}`
                        }
                      >
                        {data.columns.map((column) => (
                          <td
                            key={column.key}
                            className={
                              column.type?.startsWith("money")
                                ? "font-extrabold"
                                : ""
                            }
                          >
                            {row.sourcePath && column === data.columns[0] ? (
                              <Link
                                className="text-[var(--green)] hover:underline"
                                href={row.sourcePath}
                              >
                                {valueOf(row, column)}
                              </Link>
                            ) : (
                              valueOf(row, column)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="mt-5 space-y-3 lg:hidden">
                {data.rows.map((row, index) => (
                  <article
                    className="card p-4"
                    key={
                      row.id ||
                      row.invoice ||
                      row.purchase ||
                      `${page}-${index}`
                    }
                  >
                    {data.columns.slice(0, 6).map((column) => (
                      <div
                        className="flex justify-between gap-4 border-b border-[var(--line)] py-2 last:border-0"
                        key={column.key}
                      >
                        <span className="text-xs font-bold text-[var(--muted)]">
                          {column.label}
                        </span>
                        <strong className="text-right text-sm">
                          {valueOf(row, column)}
                        </strong>
                      </div>
                    ))}
                  </article>
                ))}
              </section>
              <div className="report-controls mt-5 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
                <p className="text-[var(--muted)]">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total} records
                </p>
                <div className="flex gap-2">
                  <button
                    className="btn !min-h-9"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <span className="px-3 py-2 font-bold">
                    {page} / {pagination.pages}
                  </span>
                  <button
                    className="btn !min-h-9"
                    disabled={page >= pagination.pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <section className="card mt-5 grid min-h-64 place-items-center p-8 text-center">
              <div>
                <FileBarChart
                  className="mx-auto text-[var(--green)]"
                  size={34}
                />
                <h2 className="mt-4 font-extrabold">
                  No records found for this period
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Try another date range or clear the current filters.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
