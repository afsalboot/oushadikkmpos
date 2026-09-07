"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  IndianRupee,
  Landmark,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
const money = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));
const num = (v) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    Number(v || 0),
  );
const fmt = (v, o = { dateStyle: "medium" }) =>
  new Intl.DateTimeFormat("en-IN", o).format(new Date(v));
async function api(url) {
  const r = await fetch(url),
    j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j.data;
}
const colors = ["#1f6b45", "#3b82f6", "#8b5cf6", "#d97706", "#dc2626"];
function Card({ title, action, children, className = "" }) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({ title, body, action }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-[var(--line)] p-5 text-center">
      <div>
        <p className="font-extrabold">{title}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
function Skel() {
  return <div className="h-36 loading-shimmer rounded-2xl bg-[#e9eee9]" />;
}
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
export default function DashboardWorkspace() {
  const [range, setRange] = useState("today"),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [invoice, setInvoice] = useState(null);
  useEffect(() => {
    let active = true;
    api(`/api/dashboard?range=${range}`)
      .then((v) => active && setData(v))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range]);
  if (error && !data)
    return (
      <Empty
        title="Dashboard could not load"
        body={error}
        action={
          <button className="btn" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Retry
          </button>
        }
      />
    );
  const k = data
    ? [
        {
          l: "Sales",
          v: money(data.kpis.sales),
          c: data.kpis.comparisons.sales,
          i: IndianRupee,
          h: "/sales",
          t: "bg-emerald-50 text-emerald-700",
        },
        {
          l: "Orders",
          v: data.kpis.orders,
          c: data.kpis.comparisons.orders,
          i: ShoppingCart,
          h: "/sales",
          t: "bg-blue-50 text-blue-700",
        },
        {
          l: "Gross profit",
          v: money(data.kpis.profit),
          c: data.kpis.comparisons.profit,
          i: TrendingUp,
          h: "/accounts",
          t: "bg-violet-50 text-violet-700",
        },
        {
          l: "Transactions",
          v: data.kpis.transactions,
          c: data.kpis.comparisons.transactions,
          i: ReceiptText,
          h: "/accounts",
          t: "bg-orange-50 text-orange-700",
        },
        {
          l: "Low stock",
          v: data.kpis.lowStock,
          n: "Needs attention",
          i: AlertTriangle,
          h: "/products",
          t: "bg-red-50 text-red-700",
        },
      ]
    : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[var(--green)]">
            Operational command center
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">
            {greeting()}
            {data?.currentUser?.name
              ? `, ${String(data.currentUser.name).trim().split(/\s+/)[0]}`
              : ""}{" "}
            👋
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Here&apos;s what&apos;s happening in your store today.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-2">
            <small className="font-bold text-[var(--muted)]">TODAY</small>
            <p className="font-extrabold">
              {fmt(new Date(), { dateStyle: "long" })}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-2">
            <small className="font-bold text-[var(--muted)]">
              CURRENT BRANCH
            </small>
            <p className="font-extrabold">Main Branch</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 overflow-auto">
        {[
          ["today", "Today"],
          ["yesterday", "Yesterday"],
          ["7d", "Last 7 Days"],
          ["week", "This Week"],
          ["month", "This Month"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setRange(v)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-extrabold ${range === v ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading && !data
          ? Array.from({ length: 5 }, (_, i) => <Skel key={i} />)
          : k.map((x) => (
              <Link
                href={x.h}
                className="card group p-5 transition hover:-translate-y-0.5"
                key={x.l}
              >
                <div className="flex justify-between">
                  <span
                    className={`grid size-10 place-items-center rounded-xl ${x.t}`}
                  >
                    <x.i size={19} />
                  </span>
                  <ArrowUpRight size={16} />
                </div>
                <p className="mt-4 text-xs font-bold uppercase text-[var(--muted)]">
                  {data.rangeLabel} {x.l}
                </p>
                <p className="mt-1 text-2xl font-extrabold">{x.v}</p>
                <p
                  className={`mt-2 text-xs font-bold ${x.c == null ? "text-[var(--muted)]" : x.c >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                >
                  {x.c == null
                    ? x.n || "No comparison data"
                    : `${x.c >= 0 ? "↑" : "↓"} ${Math.abs(x.c)}% vs previous`}
                </p>
              </Link>
            ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
        <Card
          title="Sales overview"
          action={<span className="pill">{data?.rangeLabel}</span>}
          className="min-h-[370px]"
        >
          {data?.salesOverview.chart.some((x) => x.sales || x.previous) ? (
            <>
              <div className="mb-3 flex gap-8">
                <div>
                  <small className="text-[var(--muted)]">Current</small>
                  <p className="text-2xl font-extrabold">
                    {money(data.salesOverview.current)}
                  </p>
                </div>
                <div>
                  <small className="text-[var(--muted)]">Previous</small>
                  <p className="text-2xl font-extrabold text-[var(--muted)]">
                    {money(data.salesOverview.previous)}
                  </p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={270}>
                <AreaChart data={data.salesOverview.chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${v / 1000}K` : v}`}
                  />
                  <Tooltip formatter={(v, n) => [money(v), n]} />
                  <Area
                    dataKey="previous"
                    stroke="#aab4ad"
                    fill="transparent"
                    strokeDasharray="5 5"
                  />
                  <Area
                    dataKey="sales"
                    stroke="#1f6b45"
                    strokeWidth={3}
                    fill="#dceade"
                    fillOpacity={0.7}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </>
          ) : (
            <Empty
              title="No sales yet"
              body="Complete the first sale to see revenue and profit trends."
              action={
                <Link href="/sales" className="btn btn-primary">
                  Start sale
                </Link>
              }
            />
          )}
        </Card>
        <div className="grid gap-5">
          <Card
            title="Top selling products"
            action={
              <Link
                href="/reports"
                className="text-xs font-bold text-[var(--green)]"
              >
                View all
              </Link>
            }
          >
            {data?.topProducts.length ? (
              <div className="space-y-3">
                {data.topProducts.map((x, i) => (
                  <div className="flex items-center gap-3" key={x.id}>
                    <span className="grid size-8 place-items-center rounded-lg bg-[var(--green-soft)] font-extrabold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">
                        {x.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {x.category} · {num(x.quantity)} sold
                      </p>
                    </div>
                    <strong>{money(x.revenue)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No product sales"
                body="Rankings appear after sales."
              />
            )}
          </Card>
          <Card title="Recent transactions">
            {data?.recentTransactions.length ? (
              <div className="space-y-1">
                {data.recentTransactions.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => setInvoice(s)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[#f3f6f1]"
                  >
                    <ReceiptText size={17} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">
                        {s.invoiceNumber}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {s.payments?.map((p) => p.method).join(" + ")} ·{" "}
                        {fmt(s.createdAt, { timeStyle: "short" })}
                      </p>
                    </div>
                    <strong>{money(s.total)}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="No transactions"
                body="Completed invoices appear here."
              />
            )}
          </Card>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Inventory overview">
          <div className="rounded-xl bg-[#f3f6f1] p-4">
            <small className="text-[var(--muted)]">Inventory value</small>
            <p className="text-2xl font-extrabold">
              {money(data?.inventory.value)}
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {data &&
              Object.entries(data.inventory.groups).map(([u, v]) => (
                <div className="flex justify-between" key={u}>
                  <span className="capitalize text-[var(--muted)]">
                    {u === "ml" ? "Liquids" : u === "g" ? "Powders" : u}
                  </span>
                  <strong>
                    {num(v)} {u}
                  </strong>
                </div>
              ))}
          </div>
        </Card>
        <Card title="Expiring soon">
          {data?.expiring.length ? (
            <div className="space-y-3">
              {data.expiring.map((x) => (
                <div className="flex justify-between gap-2" key={x.id}>
                  <div>
                    <p className="text-sm font-extrabold">{x.product}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Batch {x.batch} · {fmt(x.expiryDate)}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-2 py-1 text-xs font-bold ${x.days <= 7 ? "bg-red-50 text-red-700" : x.days <= 30 ? "bg-orange-50 text-orange-700" : "bg-yellow-50 text-yellow-700"}`}
                  >
                    {x.days} days
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No near-expiry batches"
              body="The next 60 days are clear."
            />
          )}
        </Card>
        <Card title="Low stock alerts">
          {data?.lowStock.length ? (
            <div className="space-y-4">
              {data.lowStock.map((x) => (
                <div key={x.id}>
                  <div className="flex justify-between text-sm">
                    <strong>{x.name}</strong>
                    <span>
                      {num(x.current)} / {num(x.reorder)} {x.unit}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-red-50">
                    <div
                      className="h-full rounded-full bg-[var(--red)]"
                      style={{
                        width: `${Math.min(100, (x.current / x.reorder) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Stock levels healthy"
              body="No products are below reorder level."
            />
          )}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Opened loose stock">
          {data?.opened.length ? (
            <div className="space-y-3">
              {data.opened.map((x) => (
                <div className="rounded-xl bg-[#f7f8f4] p-3" key={x.id}>
                  <strong className="text-sm">{x.product}</strong>
                  <p className="text-xs text-[var(--muted)]">
                    {x.sealed} sealed {x.packageType} +{" "}
                    <b className="text-[var(--green)]">
                      {num(x.open)} {x.unit} open
                    </b>
                  </p>
                  <small>Batch {x.batch}</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No opened stock"
              body="Opened package quantities appear here."
            />
          )}
        </Card>
        <Card title="Loose sales">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 p-4">
              <small>Loose lines</small>
              <p className="text-2xl font-extrabold">
                {data?.loose.count || 0}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <small>Revenue</small>
              <p className="text-2xl font-extrabold">
                {money(data?.loose.revenue)}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {data &&
              Object.entries(data.loose.quantities)
                .filter(([, v]) => v)
                .map(([u, v]) => (
                  <div className="flex justify-between" key={u}>
                    <span>{u}</span>
                    <strong>
                      {num(v)} {u}
                    </strong>
                  </div>
                ))}
          </div>
        </Card>
        <Card title="Mixture sales">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-violet-50 p-4">
              <small>Mixtures</small>
              <p className="text-2xl font-extrabold">
                {data?.mixtures.count || 0}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <small>Revenue</small>
              <p className="text-2xl font-extrabold">
                {money(data?.mixtures.revenue)}
              </p>
            </div>
          </div>
          {data?.mixtures.items.map((x) => (
            <div className="mt-3 flex justify-between text-sm" key={x.name}>
              <span>{x.name}</span>
              <strong>{x.sales} sales</strong>
            </div>
          ))}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Payment breakdown">
          {data?.payments.length ? (
            <div className="grid grid-cols-[130px_1fr] items-center">
              <ResponsiveContainer height={130}>
                <PieChart>
                  <Pie
                    data={data.payments}
                    dataKey="amount"
                    innerRadius={35}
                    outerRadius={55}
                  >
                    {data.payments.map((x, i) => (
                      <Cell key={x.method} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={money} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {data.payments.map((x, i) => (
                  <div
                    className="mb-2 flex justify-between text-sm"
                    key={x.method}
                  >
                    <span>
                      <i
                        className="mr-2 inline-block size-2 rounded-full"
                        style={{ background: colors[i % colors.length] }}
                      />
                      {x.method}
                    </span>
                    <strong>
                      {money(x.amount)} <small>{x.percent}%</small>
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              title="No payments"
              body="Payment distribution appears after sales."
            />
          )}
        </Card>
        <Card title="Financial summary">
          {[
            ["Gross sales", data?.financial.sales],
            ["Expenses", data?.financial.expenses],
            ["Gross profit", data?.financial.profit],
            ["Net cash movement", data?.financial.netMovement],
          ].map(([l, v], i) => (
            <div
              className="flex justify-between border-b py-2 last:border-0"
              key={l}
            >
              <span className="text-[var(--muted)]">{l}</span>
              <strong className={i === 1 ? "text-[var(--red)]" : ""}>
                {money(v)}
              </strong>
            </div>
          ))}
        </Card>
        <Card title="Purchases">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-orange-50 p-4">
              <small>Total</small>
              <p className="text-xl font-extrabold">
                {money(data?.purchases.total)}
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4">
              <small>Orders</small>
              <p className="text-xl font-extrabold">
                {data?.purchases.count || 0}
              </p>
            </div>
          </div>
          {data?.purchases.latest && (
            <div className="mt-4 rounded-xl border p-3">
              <small>Latest</small>
              <p className="font-extrabold">
                {data.purchases.latest.purchaseNumber}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {data.purchases.latest.supplierId?.name} ·{" "}
                {money(data.purchases.latest.total)}
              </p>
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Sales by category" className="lg:col-span-2">
          {data?.categories.length ? (
            <div className="space-y-3">
              {data.categories.map((x) => (
                <div key={x.name}>
                  <div className="flex justify-between text-sm">
                    <span>{x.name}</span>
                    <strong>
                      {x.percent}% · {money(x.value)}
                    </strong>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#edf1ed]">
                    <div
                      className="h-full rounded-full bg-[var(--green)]"
                      style={{ width: `${x.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No category activity"
              body="Category revenue appears after sales."
            />
          )}
        </Card>
        <Link href="/purchases" className="card p-5">
          <Users className="text-[var(--green)]" />
          <p className="mt-8 text-sm text-[var(--muted)]">Active suppliers</p>
          <p className="text-3xl font-extrabold">
            {data?.suppliers.active || 0}
          </p>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total products", data?.totals.products, Boxes],
          ["Active customers", data?.totals.customers, Users],
          ["Suppliers", data?.totals.suppliers, ClipboardList],
          ["Staff", data?.totals.staff, Users],
          ["Inventory value", money(data?.totals.inventoryValue), Landmark],
        ].map(([l, v, I]) => (
          <div className="card p-4" key={l}>
            <I size={18} className="text-[var(--green)]" />
            <p className="mt-4 text-xs text-[var(--muted)]">{l}</p>
            <p className="text-xl font-extrabold">{v ?? "—"}</p>
          </div>
        ))}
      </div>
      <Card
        title="Wholesale sales"
        action={
          <Link
            href="/reports"
            className="text-xs font-bold text-[var(--green)]"
          >
            View wholesale report
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-emerald-50 p-4">
            <small>Revenue</small>
            <p className="text-xl font-extrabold">
              {money(data?.wholesale?.revenue)}
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4">
            <small>Invoices</small>
            <p className="text-xl font-extrabold">
              {data?.wholesale?.invoices || 0}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <small>Paid quantity</small>
            <p className="text-xl font-extrabold">
              {num(data?.wholesale?.paidQuantity)}
            </p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <small>Free quantity</small>
            <p className="text-xl font-extrabold">
              {num(data?.wholesale?.freeQuantity)}
            </p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <small>Total stock out</small>
            <p className="text-xl font-extrabold">
              {num(data?.wholesale?.totalOutgoing)}
            </p>
          </div>
        </div>
        {data?.wholesale?.products?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.wholesale.products.map((product) => (
              <div
                className="flex items-center justify-between rounded-xl border p-3"
                key={product.id}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm">
                    {product.name}
                  </strong>
                  <small className="text-[var(--muted)]">
                    {num(product.paidQuantity)} paid +{" "}
                    {num(product.freeQuantity)} free
                  </small>
                </span>
                <strong className="ml-3 shrink-0">
                  {money(product.revenue)}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No wholesale sales"
            body="Wholesale invoices and stock-out quantities appear here."
          />
        )}
      </Card>
      {invoice && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4">
          <section className="card max-h-[90vh] w-full max-w-2xl overflow-auto p-6">
            <div className="flex justify-between">
              <div>
                <small>SALE INVOICE</small>
                <h2 className="text-2xl font-extrabold">
                  {invoice.invoiceNumber}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {invoice.customerSnapshot?.name} ·{" "}
                  {fmt(invoice.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <button onClick={() => setInvoice(null)}>
                <X />
              </button>
            </div>
            <div className="mt-5 divide-y rounded-xl border px-4">
              {invoice.items.map((x, i) => (
                <div className="flex justify-between py-3" key={i}>
                  <span>
                    {x.name} × {x.quantity}
                  </span>
                  <strong>{money(x.total)}</strong>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-between text-xl">
              <b>Total</b>
              <b>{money(invoice.total)}</b>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
