"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-location-assign-relative-destination */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  LoaderCircle,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { serializedFilterEntries } from "@/lib/filter-utils";
import { useConfirm } from "@/components/ConfirmDialog";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import ReceiptPrintButton from "@/components/ThermalReceiptPrinter";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const ACTION_MENU_WIDTH = 240;
const ACTION_MENU_HEIGHT = 248;
const VIEWPORT_GAP = 12;

function actionMenuPosition(trigger) {
  const box = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const offsetLeft = viewport?.offsetLeft || 0;
  const offsetTop = viewport?.offsetTop || 0;
  if (viewportWidth < 640) return { mobile: true };

  const left = Math.min(
    offsetLeft + viewportWidth - ACTION_MENU_WIDTH - VIEWPORT_GAP,
    Math.max(offsetLeft + VIEWPORT_GAP, box.right - ACTION_MENU_WIDTH),
  );
  const roomBelow = offsetTop + viewportHeight - box.bottom;
  const top =
    roomBelow >= ACTION_MENU_HEIGHT + VIEWPORT_GAP
      ? box.bottom + 6
      : Math.max(
          offsetTop + VIEWPORT_GAP,
          box.top - ACTION_MENU_HEIGHT - 6,
        );
  return { mobile: false, left, top };
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const sorted = [...pages]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);
  return sorted.flatMap((pageNumber, index) =>
    index && pageNumber - sorted[index - 1] > 1
      ? ["ellipsis-" + pageNumber, pageNumber]
      : [pageNumber],
  );
}
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const payment = (bill) =>
  bill.paymentStatus === "UNPAID"
    ? "CREDIT"
    :
  [...new Set((bill.payments || []).map((item) => item.method))].join(" + ") ||
  "—";
async function api(url, options) {
  if (url === "/api/customers/") return null;
  const response = await fetch(url, options),
    json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  if (
    (!options?.method || options.method === "GET") &&
    /^\/api\/customers\/[^/?]+$/.test(url) &&
    !json.data?.customer
  )
    throw new Error("Customer details are unavailable");
  return json.data;
}

function CustomerForm({ customer, initialType = "RETAIL", onClose, onSaved }) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [customerType, setCustomerType] = useState(
      customer?.customerType || initialType,
    );
  const typeLabel = customerType === "WHOLESALE" ? "Wholesale" : "Retail";
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      customerType,
    };
    try {
      await api(
        customer ? `/api/customers/${customer._id}` : "/api/customers",
        {
          method: customer ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      toast.success(
        customer
          ? "Customer updated successfully."
          : `${typeLabel} customer created successfully.`,
      );
      onSaved();
    } catch (issue) {
      setError(issue.message);
      toast.error(
        customer
          ? "Unable to update customer."
          : `Unable to create ${typeLabel.toLowerCase()} customer.`,
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !saving && onClose()
      }
    >
      <form
        className="card max-h-[94vh] w-full max-w-2xl overflow-auto p-6"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
              {customer
                ? "Customer profile"
                : `New ${typeLabel.toLowerCase()} customer`}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">
              {customer ? "Edit customer" : `Add ${typeLabel} Customer`}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {customer
                ? "Update the saved customer profile."
                : customerType === "WHOLESALE"
                  ? "Save wholesale business, GST and credit details."
                  : "Save retail contact and billing details."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-[var(--red)]">
            {error}
          </div>
        )}
        <div className="mt-6 space-y-4">
          {customer ? (
            <label>
              <span className="label">Customer type</span>
              <select
                className="field"
                value={customerType}
                onChange={(event) => setCustomerType(event.target.value)}
              >
                <option value="RETAIL">Retail</option>
                <option value="WHOLESALE">Wholesale</option>
              </select>
            </label>
          ) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
              <span className="font-extrabold text-emerald-800">
                {typeLabel} customer
              </span>
              <p className="mt-1 text-emerald-700">
                This profile will be saved in the {typeLabel.toLowerCase()}{" "}
                customer directory.
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">
                {customerType === "WHOLESALE"
                  ? "Contact person *"
                  : "Customer name *"}
              </span>
              <input
                className="field"
                name="name"
                defaultValue={customer?.name}
                required
                autoFocus
              />
            </label>
            {customerType === "WHOLESALE" && (
              <label>
                <span className="label">Business name *</span>
                <input
                  className="field"
                  name="businessName"
                  defaultValue={customer?.businessName}
                  required={!customer}
                />
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Mobile</span>
              <input
                className="field"
                name="phone"
                type="tel"
                defaultValue={customer?.phone}
                pattern="[0-9+ ()-]{7,18}"
              />
            </label>
            <label>
              <span className="label">Email</span>
              <input
                className="field"
                name="email"
                type="email"
                defaultValue={customer?.email}
              />
            </label>
          </div>
          {customerType === "WHOLESALE" ? (
            <>
              <label>
                <span className="label">GSTIN</span>
                <input
                  className="field uppercase"
                  name="gstin"
                  defaultValue={customer?.gstin}
                  maxLength={15}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Billing address</span>
                  <textarea
                    className="field min-h-20"
                    name="billingAddress"
                    defaultValue={customer?.billingAddress || customer?.address}
                  />
                </label>
                <label>
                  <span className="label">Shipping address</span>
                  <textarea
                    className="field min-h-20"
                    name="shippingAddress"
                    defaultValue={customer?.shippingAddress}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label>
                  <span className="label">Credit limit</span>
                  <input
                    className="field"
                    name="creditLimit"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={customer?.creditLimit || 0}
                  />
                </label>
                <label>
                  <span className="label">Outstanding amount</span>
                  <input
                    className="field"
                    name="outstandingAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={customer?.outstandingAmount || 0}
                  />
                </label>
                <label>
                  <span className="label">Default discount %</span>
                  <input
                    className="field"
                    name="defaultDiscount"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={customer?.defaultDiscount || 0}
                  />
                </label>
              </div>
              <label>
                <span className="label">Notes</span>
                <textarea
                  className="field min-h-20"
                  name="notes"
                  defaultValue={customer?.notes}
                />
              </label>
            </>
          ) : (
            <label>
              <span className="label">Address</span>
              <textarea
                className="field min-h-24"
                name="address"
                defaultValue={customer?.address}
              />
            </label>
          )}
          <label>
            <span className="label">Status</span>
            <select
              className="field"
              name="status"
              defaultValue={
                customer?.status ||
                (customer?.active === false ? "INACTIVE" : "ACTIVE")
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="loading-shimmer-icon" size={17} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {saving
              ? "Saving…"
              : customer
                ? "Save changes"
                : `Create ${typeLabel} Customer`}
          </button>
        </div>
      </form>
    </div>
  );
}

function InvoiceModal({ bill, onClose }) {
  if (!bill) return null;
  return (
    <div
      className="fixed inset-0 z-[140] grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="card max-h-[92vh] w-full max-w-2xl overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Sales invoice
            </p>
            <h2 className="mt-1 text-xl font-extrabold">
              {bill.invoiceNumber}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {dateTime(bill.createdAt)} · {payment(bill)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close invoice">
            <X />
          </button>
        </div>
        <div className="mt-6 space-y-3">
          {(bill.items || []).map((item, index) => (
            <div className="rounded-xl border p-4" key={`${bill._id}-${index}`}>
              <div className="flex justify-between gap-4">
                <div>
                  <b>{item.name}</b>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.saleMode === "LOOSE"
                      ? `${item.baseQuantity} ${item.baseUnit} Loose`
                      : item.saleMode === "MIX"
                        ? `${item.ingredients?.reduce((sum, row) => sum + Number(row.baseQuantity || 0), 0)} ${item.ingredients?.[0]?.baseUnit || "ml"} mixture`
                        : `${item.quantity} ${item.packageType || "package"}`}
                  </p>
                </div>
                <b>{money(item.total)}</b>
              </div>
              {item.kind === "MIX" && (
                <div className="mt-3 border-t border-dashed pt-3 text-sm">
                  {item.ingredients?.map((ingredient, i) => (
                    <div
                      className="flex justify-between py-1 text-[var(--muted)]"
                      key={i}
                    >
                      <span>
                        {ingredient.name} · {ingredient.baseQuantity}{" "}
                        {ingredient.baseUnit}
                      </span>
                      <span>{money(ingredient.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-dashed pt-4">
          <div className="flex justify-between text-xl">
            <b>Invoice total</b>
            <b>{money(bill.total)}</b>
          </div>
          {Number(bill.balanceDue || 0) > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span>Amount paid</span>
                <b>{money(bill.amountPaid)}</b>
              </div>
              <div className="flex justify-between text-amber-700">
                <b>Balance due</b>
                <b>{money(bill.balanceDue)}</b>
              </div>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t pt-5">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <ReceiptPrintButton sale={bill} label="Reprint Invoice" />
        </div>
      </section>
    </div>
  );
}

function DetailDrawer({ id, onClose, onEdit, onChanged }) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("overview"),
    [invoice, setInvoice] = useState(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    api(`/api/customers/${id}`, { signal: controller.signal })
      .then((value) => !controller.signal.aborted && setData(value))
      .catch((error) => {
        if (error.name === "AbortError") return;
        toast.error(error.message);
        onClose();
      })
      .finally(
        () => !controller.signal.aborted && setLoading(false),
      );
    return () => controller.abort();
  }, [id, onClose]);
  function startSale() {
    sessionStorage.setItem(
      "oushadi-preselected-customer",
      JSON.stringify(data.customer),
    );
    window.location.href = "/sales";
  }
  if (!id) return null;
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/35"
        onMouseDown={(event) =>
          event.target === event.currentTarget && onClose()
        }
      >
        <aside
          className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Customer details"
        >
          {loading ? (
            <div className="grid h-full place-items-center">
              <LoaderCircle className="loading-shimmer-icon text-[var(--green)]" />
            </div>
          ) : (
            data && (
              <>
                <header className="sticky top-0 z-10 border-b bg-white p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] text-lg font-extrabold text-[var(--green)]">
                        {initials(data.customer.name)}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-extrabold">
                          {data.customer.name}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          Customer since {date(data.customer.createdAt)}
                        </p>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-extrabold ${data.customer.active === false || data.customer.status === "INACTIVE" ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {data.customer.active === false ||
                          data.customer.status === "INACTIVE"
                            ? "Inactive"
                            : "Active"}
                        </span>
                      </div>
                    </div>
                    <button onClick={onClose} aria-label="Close drawer">
                      <X />
                    </button>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className="btn"
                      onClick={() => onEdit(data.customer)}
                    >
                      <Edit3 size={16} />
                      Edit Customer
                    </button>
                    <button className="btn btn-primary" onClick={startSale}>
                      <ShoppingCart size={16} />
                      Start New Sale
                    </button>
                  </div>
                  <div className="mt-5 flex gap-5 border-b">
                    {[
                      ["overview", "Overview"],
                      ["purchases", "Purchases"],
                      ["activity", "Activity"],
                    ].map(([value, label]) => (
                      <button
                        className={`border-b-2 pb-3 text-sm font-extrabold ${tab === value ? "border-[var(--green)] text-[var(--green)]" : "border-transparent text-[var(--muted)]"}`}
                        key={value}
                        onClick={() => setTab(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </header>
                <div className="p-5 sm:p-6">
                  {tab === "overview" && (
                    <div className="space-y-7">
                      <section>
                        <h3 className="label">Customer summary</h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {[
                            ["Total purchases", data.stats.purchaseCount],
                            ["Total spent", money(data.stats.totalSpent)],
                            ["Average bill", money(data.stats.averageBill)],
                            ["Highest bill", money(data.stats.highestBill)],
                            [
                              "First purchase",
                              date(data.stats.firstPurchaseAt),
                            ],
                            ["Last purchase", date(data.stats.lastPurchaseAt)],
                          ].map(([label, value]) => (
                            <div
                              className="rounded-xl border bg-[#fbfcfa] p-4"
                              key={label}
                            >
                              <span className="text-xs text-[var(--muted)]">
                                {label}
                              </span>
                              <b className="mt-1 block">{value}</b>
                            </div>
                          ))}
                        </div>
                      </section>
                      <section>
                        <h3 className="label">Contact information</h3>
                        <div className="rounded-xl border p-4 text-sm">
                          <p className="flex gap-3 py-2">
                            <Phone size={17} className="text-[var(--green)]" />
                            {data.customer.phone || "No phone number"}
                          </p>
                          <p className="flex gap-3 py-2">
                            <Mail size={17} className="text-[var(--green)]" />
                            {data.customer.email || "No email address"}
                          </p>
                          <p className="flex gap-3 py-2">
                            <UserRound
                              size={17}
                              className="text-[var(--green)]"
                            />
                            {data.customer.address || "No address"}
                          </p>
                        </div>
                      </section>
                      <section>
                        <h3 className="label">Frequently purchased</h3>
                        {data.frequentProducts.length ? (
                          <div className="divide-y rounded-xl border">
                            {data.frequentProducts.map((row) => (
                              <div
                                className="flex justify-between p-3 text-sm"
                                key={row.name}
                              >
                                <b>{row.name}</b>
                                <span className="text-[var(--muted)]">
                                  {row.purchases} purchases
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--muted)]">
                            No purchase patterns yet.
                          </p>
                        )}
                      </section>
                      <RecentBills
                        bills={data.bills.slice(0, 3)}
                        onView={setInvoice}
                      />
                    </div>
                  )}
                  {tab === "purchases" && (
                    <RecentBills bills={data.bills} onView={setInvoice} full />
                  )}
                  {tab === "activity" && (
                    <div>
                      <h3 className="label">Activity</h3>
                      <div className="border-l-2 border-[var(--green-soft)] pl-5">
                        {data.bills.map((bill) => (
                          <div className="relative pb-6" key={bill._id}>
                            <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-[var(--green)]" />
                            <b>{dateTime(bill.createdAt)}</b>
                            <p className="text-sm">
                              Purchased {money(bill.total)}
                            </p>
                            <button
                              className="text-sm font-bold text-[var(--green)]"
                              onClick={() => setInvoice(bill)}
                            >
                              {bill.invoiceNumber}
                            </button>
                          </div>
                        ))}
                        <div className="relative">
                          <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-gray-300" />
                          <b>{dateTime(data.customer.createdAt)}</b>
                          <p className="text-sm text-[var(--muted)]">
                            Customer created
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </aside>
      </div>
      <InvoiceModal bill={invoice} onClose={() => setInvoice(null)} />
    </>,
    document.body,
  );
}
function RecentBills({ bills, onView, full = false }) {
  return (
    <section>
      <h3 className="label">
        {full ? "Complete purchase history" : "Recent purchases"}
      </h3>
      {bills.length ? (
        <div className="overflow-hidden rounded-xl border">
          <div className="divide-y">
            {bills.map((bill) => (
              <button
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[#f8faf7]"
                key={bill._id}
                onClick={() => onView(bill)}
              >
                <span className="min-w-0">
                  <b className="block truncate">{bill.invoiceNumber}</b>
                  <span className="text-xs text-[var(--muted)]">
                    {dateTime(bill.createdAt)} · {(bill.items || []).length}{" "}
                    items · {payment(bill)}
                  </span>
                </span>
                <span className="text-right">
                  <b className="block text-[var(--green)]">
                    {money(bill.total)}
                  </b>
                  <span className="text-xs font-bold">View</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-[var(--muted)]">
          <ReceiptText className="mx-auto mb-2" />
          No purchases for this customer.
        </div>
      )}
    </section>
  );
}

export default function CustomerWorkspaceAdvanced() {
  const confirmAction = useConfirm();
  const loadController = useRef(null);
  const [rows, setRows] = useState([]),
    [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 }),
    [kpis, setKpis] = useState({}),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [customerType, setCustomerType] = useState("RETAIL"),
    [quick, setQuick] = useState("ALL"),
    [filters, setFilters] = useState({
      lastPurchase: [],
      spending: [],
      purchaseCount: [],
      sort: "lastPurchase",
      order: "desc",
    }),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [form, setForm] = useState(null),
    [drawer, setDrawer] = useState(""),
    [menu, setMenu] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebounced(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({
      q: debounced,
      customerType,
      quick,
      page: String(page),
      limit: String(pageSize),
      status: quick === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      ...Object.fromEntries(serializedFilterEntries(filters)),
    });
    try {
      const data = await api(`/api/customers?${params}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRows(data.rows);
      setMeta(data.meta);
      setKpis(data.kpis);
      if (page > data.meta.pages) setPage(data.meta.pages);
    } catch (error) {
      if (error.name === "AbortError") return;
      setFailed(true);
      toast.error(error.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debounced, customerType, quick, page, pageSize, filters]);
  useEffect(() => {
    load();
    return () => loadController.current?.abort();
  }, [load]);
  useEffect(() => {
    let animationFrame = 0;
    const reposition = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() =>
        setMenu((current) => {
          if (!current?.trigger) return current;
          const next = actionMenuPosition(current.trigger);
          if (
            current.mobile === next.mobile &&
            current.top === next.top &&
            current.left === next.left
          )
            return current;
          return { ...current, ...next };
        }),
      );
    };
    const dismiss = (event) =>
      setMenu((current) => {
        if (
          !current ||
          current.trigger?.contains(event.target) ||
          event.target.closest?.("[data-customer-action-menu]")
        )
          return current;
        return null;
      });
    const escape = (event) => event.key === "Escape" && setMenu(null);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const closeDrawer = useCallback(() => setDrawer(""), []);
  const editFromDrawer = useCallback((customer) => {
    setDrawer("");
    setForm({ mode: "edit", customer });
  }, []);
  function changeFilter(name, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  }
  function selectCustomerType(value) {
    setCustomerType(value);
    setQuery("");
    setDebounced("");
    setQuick("ALL");
    setFilters({
      lastPurchase: [],
      spending: [],
      purchaseCount: [],
      sort: "lastPurchase",
      order: "desc",
    });
    setPage(1);
    setMenu(null);
  }
  function clear() {
    setQuery("");
    setDebounced("");
    setQuick("ALL");
    setFilters({
      lastPurchase: [],
      spending: [],
      purchaseCount: [],
      sort: "lastPurchase",
      order: "desc",
    });
    setPage(1);
  }
  async function remove(customer) {
    setMenu(null);
    const inactive =
      customer.active === false || customer.status === "INACTIVE";
    if (inactive) {
      if (
        !(await confirmAction({
          title: `Reactivate ${customer.name}?`,
          description:
            "This customer will become active and available for future sales.",
          confirmText: "Reactivate",
          cancelText: "Cancel",
          variant: "success",
        }))
      )
        return;
      try {
        await api(`/api/customers/${customer._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...customer, status: "ACTIVE" }),
        });
        toast.success("Customer reactivated.");
        load();
      } catch (error) {
        toast.error(error.message);
      }
      return;
    }
    if (
      !(await confirmAction({
        title: `Deactivate or delete ${customer.name}?`,
        description:
          "Customers with purchase history will be deactivated so invoices remain intact.",
        confirmText: "Continue",
        cancelText: "Cancel",
        variant: "danger",
      }))
    )
      return;
    try {
      const result = await api(`/api/customers/${customer._id}`, {
        method: "DELETE",
      });
      toast.success(
        result.archived
          ? "Customer deactivated. Purchase history was preserved."
          : "Customer deleted.",
      );
      load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  function startSale(customer) {
    sessionStorage.setItem(
      "oushadi-preselected-customer",
      JSON.stringify(customer),
    );
    window.location.href = "/sales";
  }
  async function exportCsv() {
    try {
      const params = new URLSearchParams({
          q: debounced,
          customerType,
          quick,
          status: quick === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          limit: "500",
          ...Object.fromEntries(serializedFilterEntries(filters)),
        }),
        data = await api(`/api/customers?${params}`),
        headers = [
          "Customer Type",
          "Name",
          "Business Name",
          "Phone",
          "Email",
          "GSTIN",
          "Address",
          "Status",
          "Total Purchases",
          "Total Spent",
          "Average Bill",
          "First Purchase",
          "Last Purchase",
          "Created At",
        ],
        lines = [
          headers,
          ...data.rows.map((row) => [
            row.customerType || "RETAIL",
            row.name,
            row.businessName,
            row.phone,
            row.email,
            row.gstin,
            row.customerType === "WHOLESALE"
              ? row.billingAddress || row.address
              : row.address,
            row.active === false ? "Inactive" : "Active",
            row.purchaseCount,
            row.totalSpent,
            row.averageBill,
            row.firstPurchaseAt || "",
            row.lastPurchaseAt || "",
            row.createdAt,
          ]),
        ].map((line) =>
          line
            .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
            .join(","),
        );
      const url = URL.createObjectURL(
          new Blob([lines.join("\n")], { type: "text/csv" }),
        ),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${customerType.toLowerCase()}-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(
        `${customerType === "WHOLESALE" ? "Wholesale" : "Retail"} customer export downloaded.`,
      );
    } catch (error) {
      toast.error(error.message);
    }
  }
  const showing = useMemo(
    () =>
      meta.total
        ? `${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`
        : "0 customers",
    [meta],
  );
  const customerTypeLabel =
    customerType === "WHOLESALE" ? "Wholesale" : "Retail";
  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[var(--green)]">
            Customer directory
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Customers</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Manage retail shoppers and wholesale business accounts in separate
            directories.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={exportCsv}>
            <Download size={17} />
            Export {customerTypeLabel}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setForm({ mode: "create", customerType })}
          >
            <Plus size={17} />
            Add {customerTypeLabel} Customer
          </button>
        </div>
      </header>
      <section className="card mb-5 p-2" aria-label="Customer type">
        <div className="grid grid-cols-2 gap-2">
          {[
            [
              "RETAIL",
              "Retail Customers",
              "Personal shoppers and regular billing",
            ],
            [
              "WHOLESALE",
              "Wholesale Customers",
              "Businesses, GST and credit accounts",
            ],
          ].map(([value, label, help]) => (
            <button
              type="button"
              key={value}
              onClick={() => selectCustomerType(value)}
              aria-pressed={customerType === value}
              className={`rounded-xl border px-4 py-3 text-left transition ${customerType === value ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]" : "border-transparent hover:border-[var(--line)] hover:bg-[#f8faf7]"}`}
            >
              <span className="block text-sm font-extrabold">{label}</span>
              <span className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
                {help}
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          [
            `Total ${customerTypeLabel}`,
            kpis.totalCustomers,
            "Active registered profiles",
            Users,
          ],
          [
            "New This Month",
            kpis.newThisMonth,
            "Profiles created this month",
            UserRound,
          ],
          [
            "Repeat Customers",
            kpis.repeatCustomers,
            "2 or more completed purchases",
            RotateCcw,
          ],
          [
            "Customer Revenue",
            money(kpis.customerRevenue),
            "Registered customer invoices",
            Activity,
          ],
        ].map(([label, value, help, Icon]) => (
          <section className="card p-4" key={label}>
            <div className="flex justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
                <Icon size={18} />
              </span>
              <span className="text-xs text-[var(--muted)]">Live</span>
            </div>
            <b className="mt-4 block text-2xl">{loading ? "—" : value || 0}</b>
            <p className="text-sm font-bold">{label}</p>
            <p className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
              {help}
            </p>
          </section>
        ))}
      </div>
      <section className="card mt-5 p-4">
        <div className="relative">
          <Search
            className="absolute left-4 top-3.5 text-[var(--muted)]"
            size={19}
          />
          <input
            className="field !min-h-12 !pl-12"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              customerType === "WHOLESALE"
                ? "Search business, contact, GSTIN, phone or email..."
                : "Search retail customer name, phone or email..."
            }
          />
        </div>
        <div className="mt-4 flex gap-2 overflow-auto">
          {[
            ["ALL", `All ${customerTypeLabel}`],
            ["NEW", "New"],
            ["REPEAT", "Repeat"],
            ["HIGH_VALUE", "High Value"],
            ["INACTIVE", "Inactive"],
          ].map(([value, label]) => (
            <button
              className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-extrabold ${quick === value ? "border-[var(--green)] bg-[var(--green)] text-white" : "bg-white"}`}
              key={value}
              onClick={() => {
                setQuick(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Filter
            multiple
            label="Last purchase"
            value={filters.lastPurchase}
            onChange={(value) => changeFilter("lastPurchase", value)}
            options={[
              ["", "Any Time"],
              ["TODAY", "Today"],
              ["7_DAYS", "Last 7 Days"],
              ["30_DAYS", "Last 30 Days"],
              ["3_MONTHS", "Last 3 Months"],
              ["NO_RECENT", "No Recent Purchase"],
            ]}
          />
          <Filter
            multiple
            label="Spending"
            value={filters.spending}
            onChange={(value) => changeFilter("spending", value)}
            options={[
              ["", "Any Amount"],
              ["UNDER_1000", "Under ₹1,000"],
              ["1000_5000", "₹1,000–₹5,000"],
              ["5000_10000", "₹5,000–₹10,000"],
              ["ABOVE_10000", "Above ₹10,000"],
            ]}
          />
          <Filter
            multiple
            label="Purchases"
            value={filters.purchaseCount}
            onChange={(value) => changeFilter("purchaseCount", value)}
            options={[
              ["", "Any Count"],
              ["1", "1 Purchase"],
              ["2_5", "2–5 Purchases"],
              ["6_10", "6–10 Purchases"],
              ["10_PLUS", "10+ Purchases"],
            ]}
          />
          <Filter
            label="Sort"
            value={filters.sort}
            onChange={(value) => changeFilter("sort", value)}
            options={[
              ["lastPurchase", "Last Purchase"],
              ["name", "Name"],
              ["purchases", "Total Purchases"],
              ["totalSpent", "Total Spent"],
              ["averageBill", "Average Bill"],
              ["createdAt", "Created Date"],
            ]}
          />
          <Filter
            label="Order"
            value={filters.order}
            onChange={(value) => changeFilter("order", value)}
            options={[
              ["desc", "Highest / Newest"],
              ["asc", "Lowest / Oldest"],
            ]}
          />
        </div>
      </section>
      {failed ? (
        <div className="card mt-5 grid min-h-64 place-items-center text-center">
          <div>
            <b>Unable to load customers.</b>
            <button className="btn mx-auto mt-4" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      ) : loading ? (
        <Skeleton />
      ) : rows.length ? (
        <>
          <div className="card table-wrap mt-5">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Purchases</th>
                  <th>Total Spent</th>
                  <th>Avg Bill</th>
                  <th>Last Purchase</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr
                    className="cursor-pointer hover:bg-[#f8faf7]"
                    key={customer._id}
                    onClick={() => setDrawer(customer._id)}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full bg-[var(--green-soft)] font-extrabold text-[var(--green)]">
                          {initials(
                            customerType === "WHOLESALE"
                              ? customer.businessName || customer.name
                              : customer.name,
                          )}
                        </span>
                        <span>
                          <b className="block">
                            {customerType === "WHOLESALE"
                              ? customer.businessName || customer.name
                              : customer.name}
                          </b>
                          <small className="text-[var(--muted)]">
                            {customerType === "WHOLESALE" &&
                            customer.businessName
                              ? `${customer.name} · `
                              : ""}
                            Since {date(customer.createdAt)}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span>{customer.phone || "—"}</span>
                      <small className="block text-[var(--muted)]">
                        {customer.email || "No email"}
                      </small>
                    </td>
                    <td>
                      <b>{customer.purchaseCount}</b> Bills
                    </td>
                    <td className="font-extrabold text-[var(--green)]">
                      {money(customer.totalSpent)}
                    </td>
                    <td>{money(customer.averageBill)}</td>
                    <td>{dateTime(customer.lastPurchaseAt)}</td>
                    <td>
                      <span
                        className={`pill ${customer.active === false || customer.status === "INACTIVE" ? "!bg-gray-100 !text-gray-600" : ""}`}
                      >
                        {customer.active === false ||
                        customer.status === "INACTIVE"
                          ? "Inactive"
                          : customer.purchaseCount >= 2
                            ? "Repeat"
                            : "Active"}
                      </span>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <button
                        className="btn !min-h-9 !p-2"
                        aria-label={`Actions for ${customer.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menu?.customer._id === customer._id}
                        onClick={(event) => {
                          const trigger = event.currentTarget;
                          if (menu?.customer._id === customer._id) {
                            setMenu(null);
                            return;
                          }
                          setMenu({
                            customer,
                            trigger,
                            ...actionMenuPosition(trigger),
                          });
                        }}
                      >
                        <MoreVertical size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-[var(--muted)]">Showing {showing}</p>
              <label className="flex items-center gap-2 text-sm font-bold">
                <span className="sr-only">Customers per page</span>
                <select
                  className="field !min-h-9 !w-auto !py-1.5"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                    setMenu(null);
                  }}
                >
                  {[10, 20, 50].map((size) => (
                    <option value={size} key={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <nav
              className="flex max-w-full items-center justify-center gap-1 overflow-x-auto"
              aria-label="Customer pagination"
            >
              <button
                className="btn !min-h-9 !px-3"
                disabled={page <= 1}
                onClick={() => {
                  setPage((value) => value - 1);
                  setMenu(null);
                }}
                aria-label="Previous customer page"
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline">Previous</span>
              </button>
              {paginationItems(meta.page, meta.pages).map((item) =>
                typeof item === "string" ? (
                  <span
                    className="grid min-h-9 min-w-8 place-items-center text-sm text-[var(--muted)]"
                    key={item}
                  >
                    …
                  </span>
                ) : (
                  <button
                    className={`grid min-h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-extrabold ${item === meta.page ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-[var(--line)] bg-white hover:bg-[var(--green-soft)]"}`}
                    key={item}
                    onClick={() => {
                      setPage(item);
                      setMenu(null);
                    }}
                    aria-current={item === meta.page ? "page" : undefined}
                    aria-label={`Page ${item}`}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                className="btn !min-h-9 !px-3"
                disabled={page >= meta.pages}
                onClick={() => {
                  setPage((value) => value + 1);
                  setMenu(null);
                }}
                aria-label="Next customer page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight size={16} />
              </button>
            </nav>
          </div>
        </>
      ) : (
        <div className="card mt-5 grid min-h-72 place-items-center p-8 text-center">
          <div>
            <Users className="mx-auto text-[var(--green)]" />
            <h2 className="mt-4 text-lg font-extrabold">
              {query || quick !== "ALL"
                ? "No customers found"
                : `No ${customerTypeLabel.toLowerCase()} customers yet`}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {query || quick !== "ALL"
                ? "No customer matches your current search or filters."
                : `${customerTypeLabel} customers created during checkout or added manually will appear here.`}
            </p>
            <button
              className="btn btn-primary mt-5"
              onClick={
                query || quick !== "ALL"
                  ? clear
                  : () => setForm({ mode: "create", customerType })
              }
            >
              {query || quick !== "ALL"
                ? "Clear Filters"
                : `Add ${customerTypeLabel} Customer`}
            </button>
          </div>
        </div>
      )}
      {menu &&
        createPortal(
          <div
            className="fixed inset-0 z-[109] bg-black/25 sm:pointer-events-none sm:bg-transparent"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setMenu(null)
            }
          >
            <div
              data-customer-action-menu
              role="menu"
              aria-label={`Actions for ${menu.customer.name}`}
              className={`fixed max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border bg-white p-2 shadow-2xl sm:pointer-events-auto sm:w-60 sm:rounded-xl ${menu.mobile ? "inset-x-3 bottom-3" : ""}`}
              style={
                menu.mobile ? undefined : { top: menu.top, left: menu.left }
              }
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 pb-2 pt-1 sm:hidden">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    Customer actions
                  </p>
                  <b className="block max-w-[70vw] truncate">
                    {menu.customer.businessName || menu.customer.name}
                  </b>
                </div>
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-full hover:bg-slate-100"
                  onClick={() => setMenu(null)}
                  aria-label="Close customer actions"
                >
                  <X size={18} />
                </button>
              </div>
              {[
                [
                  UserRound,
                  "View Customer",
                  () => setDrawer(menu.customer._id),
                ],
                [
                  Edit3,
                  "Edit Customer",
                  () => setForm({ mode: "edit", customer: menu.customer }),
                ],
                [ShoppingCart, "Start New Sale", () => startSale(menu.customer)],
                [
                  FileText,
                  "View Purchase History",
                  () => setDrawer(menu.customer._id),
                ],
              ].map(([Icon, label, action], index) => (
                <button
                  type="button"
                  role="menuitem"
                  autoFocus={index === 0}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[#f3f6f1] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--green)]"
                  key={label}
                  onClick={() => {
                    setMenu(null);
                    action();
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
              <div className="my-1 border-t" />
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--red)] hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--red)]"
                onClick={() => remove(menu.customer)}
              >
                {menu.customer.active === false ? (
                  <RotateCcw size={16} />
                ) : (
                  <Trash2 size={16} />
                )}{" "}
                {menu.customer.active === false
                  ? "Reactivate Customer"
                  : "Deactivate / Delete"}
              </button>
            </div>
          </div>,
          document.body,
        )}
      {form && (
        <CustomerForm
          customer={form.customer}
          initialType={form.customerType}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      <DetailDrawer
        id={drawer}
        onClose={closeDrawer}
        onEdit={editFromDrawer}
        onChanged={load}
      />
    </div>
  );
}
function Filter({ label, value, onChange, options, multiple = false }) {
  if (multiple) {
    const clearOption = options.find(([key]) => key === "");
    return (
      <MultiSelectFilter
        label={label}
        placeholder={`${label}: ${clearOption?.[1] || "Any"}`}
        clearLabel={`${label}: ${clearOption?.[1] || "Any"}`}
        values={value}
        options={options
          .filter(([key]) => key !== "")
          .map(([key, text]) => ({ value: key, label: text }))}
        onChange={onChange}
      />
    );
  }
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, text]) => (
          <option value={key} key={key}>
            {label}: {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Skeleton() {
  return (
    <div className="card mt-5 space-y-3 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="h-14 loading-shimmer rounded-xl bg-[#eef2ee]"
          key={index}
        />
      ))}
    </div>
  );
}
