"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { serializedFilterEntries } from "@/lib/filter-utils";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Ellipsis,
  Eye,
  FileText,
  FolderCog,
  IndianRupee,
  Landmark,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

const inputDate = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const TODAY = inputDate(new Date());
const emptyForm = () => ({
  categoryId: "",
  staffId: "",
  title: "",
  description: "",
  amount: "",
  expenseDate: TODAY,
  paymentMethod: "CASH",
  paymentReference: "",
  paidTo: "",
  notes: "",
});
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const date = (value, withTime = false) =>
  value
    ? new Intl.DateTimeFormat(
        "en-IN",
        withTime
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "medium" },
      ).format(new Date(value))
    : "—";
async function api(url, options) {
  const response = await fetch(url, options);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Something went wrong");
  return json.data;
}

function Badge({ value }) {
  const tones = {
    MANUAL: "bg-emerald-50 text-emerald-700",
    PURCHASE: "bg-indigo-50 text-indigo-700",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    VOID: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${tones[value] || "bg-slate-100 text-slate-600"}`}
    >
      {String(value || "—").charAt(0) +
        String(value || "—")
          .slice(1)
          .toLowerCase()}
    </span>
  );
}

function ActionMenu({ row, onView, onEdit, onDuplicate, onVoid }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ top: 0, right: 0 });
  const button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);
  function toggle(event) {
    event.stopPropagation();
    if (!open) {
      const box = button.current.getBoundingClientRect();
      setPosition({
        top: box.bottom + 6,
        right: window.innerWidth - box.right,
      });
    }
    setOpen(!open);
  }
  const item = (label, Icon, action, danger = false) => (
    <button
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold hover:bg-slate-50 ${danger ? "text-[var(--red)]" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        setOpen(false);
        action();
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );
  return (
    <>
      <button
        ref={button}
        className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"
        onClick={toggle}
        aria-label={`Actions for ${row.expenseNumber || row.title}`}
      >
        <Ellipsis size={18} />
      </button>
      {open &&
        createPortal(
          <div
            style={position}
            className="fixed z-[90] w-56 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {item("View details", Eye, onView)}
            {row.source === "PURCHASE" ? (
              item("View purchase", ShoppingBag, () =>
                router.push(
                  `/purchases?search=${encodeURIComponent(row.purchase?.purchaseNumber || "")}`,
                ),
              )
            ) : (
              <>
                {item("Edit expense", Pencil, onEdit)}
                {item("Duplicate expense", Copy, onDuplicate)}
                {row.status !== "VOID" && (
                  <>
                    <div className="my-1 border-t border-[var(--line)]" />
                    {item("Void expense", RotateCcw, onVoid, true)}
                  </>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function CategoryForm({ category, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api(
        category
          ? `/api/expense-categories/${category._id}`
          : "/api/expense-categories",
        {
          method: category ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            Object.fromEntries(new FormData(event.currentTarget)),
          ),
        },
      );
      toast.success(
        category ? "Expense category updated." : "Expense category created.",
      );
      onSaved(result);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-4">
      <form className="card w-full max-w-md p-6" onSubmit={submit}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Expense category
            </p>
            <h3 className="mt-1 text-xl font-extrabold">
              {category ? "Edit category" : "Add category"}
            </h3>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label>
            <span className="label">Category name *</span>
            <input
              className="field"
              name="name"
              defaultValue={category?.name}
              autoFocus
              required
            />
          </label>
          <label>
            <span className="label">Description</span>
            <textarea
              className="field min-h-20"
              name="description"
              defaultValue={category?.description}
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="loading-shimmer-icon" size={16} />
            ) : (
              <Plus size={16} />
            )}
            Save category
          </button>
        </div>
      </form>
    </div>
  );
}

function CategoriesManager({ categories, setCategories, onClose }) {
  const confirmAction = useConfirm();
  const [editing, setEditing] = useState(null),
    [showForm, setShowForm] = useState(false),
    [saving, setSaving] = useState(false);
  async function refresh() {
    try {
      setCategories(await api("/api/expense-categories?includeInactive=true"));
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function toggle(category) {
    setSaving(true);
    try {
      await api(`/api/expense-categories/${category._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: category.name,
          description: category.description,
          active: !category.active,
        }),
      });
      toast.success(
        category.active ? "Category deactivated." : "Category activated.",
      );
      await refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(category) {
    if (
      !(await confirmAction({
        title: `Delete ${category.name}?`,
        description: "This action cannot be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
        variant: "danger",
      }))
    )
      return;
    try {
      await api(`/api/expense-categories/${category._id}`, {
        method: "DELETE",
      });
      toast.success("Category deleted.");
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--line)] p-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Administration
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">Expense categories</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Manage database-backed operating categories.
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <button
            className="btn btn-primary mb-4"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={17} />
            Add category
          </button>
          <div className="space-y-2">
            {categories.map((category) => (
              <article
                className={`rounded-xl border border-[var(--line)] p-4 ${!category.active ? "opacity-60" : ""}`}
                key={category._id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong>{category.name}</strong>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase">
                        {category.type}
                      </span>
                      {!category.active && (
                        <span className="text-xs font-bold text-[var(--red)]">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {category.description || "No description"}
                    </p>
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">
                      {category.expenseCount} expenses ·{" "}
                      {money(category.totalAmount)}
                    </p>
                  </div>
                  {category.type !== "SYSTEM" && (
                    <div className="flex gap-1">
                      <button
                        className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"
                        onClick={() => {
                          setEditing(category);
                          setShowForm(true);
                        }}
                        aria-label="Edit category"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        disabled={saving}
                        className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"
                        onClick={() => toggle(category)}
                        aria-label={
                          category.active
                            ? "Deactivate category"
                            : "Activate category"
                        }
                      >
                        <RotateCcw size={15} />
                      </button>
                      {category.expenseCount === 0 && (
                        <button
                          className="grid size-8 place-items-center rounded-lg text-[var(--red)] hover:bg-rose-50"
                          onClick={() => remove(category)}
                          aria-label="Delete category"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </aside>
      {showForm && (
        <CategoryForm
          category={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function ExpenseForm({
  initial,
  categories,
  setCategories,
  staff,
  paymentMethods,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(initial || emptyForm()),
    [saving, setSaving] = useState(false),
    [categoryForm, setCategoryForm] = useState(false);
  const selected = categories.find(
      (category) => String(category._id) === String(form.categoryId),
    ),
    salarySelected = selected?.name?.toLowerCase() === "salary";
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const result = await api(
        initial ? `/api/expenses/${initial._id}` : "/api/expenses",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      toast.success(
        initial
          ? "Expense updated successfully."
          : "Expense saved successfully.",
      );
      onSaved(result);
    } catch (error) {
      toast.error(error.message || "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/45 p-0 sm:p-4">
      <form
        onSubmit={save}
        className="mx-auto min-h-screen w-full max-w-3xl bg-[#f7f8f4] sm:min-h-0 sm:rounded-2xl"
      >
        <header className="sticky top-0 z-20 flex items-start justify-between border-b border-[var(--line)] bg-white p-5 sm:rounded-t-2xl">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
              {initial ? "Edit expense" : "New expense"}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">
              {initial
                ? "Correct operating expense"
                : "Record an operating expense"}
            </h2>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="space-y-5 p-4 sm:p-6">
          <section className="card p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]">
                <ReceiptText size={18} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
                  Expense details
                </p>
                <h3 className="font-extrabold">What was paid?</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Category *</span>
                <div className="flex gap-2">
                  <select
                    className="field"
                    value={form.categoryId}
                    onChange={(event) => {
                      const categoryId = event.target.value,
                        category = categories.find(
                          (entry) => String(entry._id) === categoryId,
                        );
                      setForm({
                        ...form,
                        categoryId,
                        staffId:
                          category?.name?.toLowerCase() === "salary"
                            ? form.staffId
                            : "",
                      });
                    }}
                    required
                  >
                    <option value="">Select category</option>
                    {categories
                      .filter(
                        (category) =>
                          category.active && category.type === "MANUAL",
                      )
                      .map((category) => (
                        <option key={category._id} value={category._id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn !px-3"
                    onClick={() => setCategoryForm(true)}
                    aria-label="Add category"
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </label>
              {salarySelected && (
                <label className="sm:col-span-2">
                  <span className="label">Employee *</span>
                  <select
                    className="field"
                    value={form.staffId || ""}
                    onChange={(event) =>
                      setForm({ ...form, staffId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select employee</option>
                    {staff.map((employee) => (
                      <option key={employee._id} value={employee._id}>
                        {employee.name} — {employee.email} · {employee.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span className="label">Expense title *</span>
                <input
                  className="field"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Electricity bill"
                  required
                />
              </label>
              <label className="sm:col-span-2">
                <span className="label">Description</span>
                <textarea
                  className="field min-h-20"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Details about this expense"
                />
              </label>
              <label>
                <span className="label">Amount *</span>
                <div className="relative">
                  <IndianRupee
                    className="absolute left-3 top-3.5 text-[var(--muted)]"
                    size={16}
                  />
                  <input
                    className="field !pl-9"
                    type="number"
                    min=".01"
                    step=".01"
                    value={form.amount}
                    onChange={(event) =>
                      setForm({ ...form, amount: event.target.value })
                    }
                    required
                  />
                </div>
              </label>
              <label>
                <span className="label">Expense date *</span>
                <input
                  className="field"
                  type="date"
                  max={TODAY}
                  value={form.expenseDate}
                  onChange={(event) =>
                    setForm({ ...form, expenseDate: event.target.value })
                  }
                  required
                />
              </label>
            </div>
          </section>
          <section className="card p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]">
                <WalletCards size={18} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
                  Payment
                </p>
                <h3 className="font-extrabold">How was it paid?</h3>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {paymentMethods.map((method) => (
                <button
                  type="button"
                  className={`btn !min-h-9 ${form.paymentMethod === method ? "btn-primary" : ""}`}
                  onClick={() =>
                    setForm({
                      ...form,
                      paymentMethod: method,
                      paymentReference:
                        method === "CASH" ? "" : form.paymentReference,
                    })
                  }
                  key={method}
                >
                  {method === "BANK"
                    ? "Bank transfer"
                    : method.charAt(0) + method.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {form.paymentMethod !== "CASH" && (
              <label className="mt-4 block">
                <span className="label">
                  {form.paymentMethod === "UPI"
                    ? "UPI / transaction reference"
                    : "Payment reference"}
                </span>
                <input
                  className="field"
                  value={form.paymentReference}
                  onChange={(event) =>
                    setForm({ ...form, paymentReference: event.target.value })
                  }
                />
              </label>
            )}
          </section>
          <section className="card p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Additional information
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Paid to</span>
                <input
                  className="field"
                  value={form.paidTo}
                  onChange={(event) =>
                    setForm({ ...form, paidTo: event.target.value })
                  }
                  placeholder="Vendor or recipient"
                />
              </label>
              <label>
                <span className="label">Notes</span>
                <input
                  className="field"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>
            </div>
          </section>
          <section className="rounded-2xl bg-[#173d29] p-5 text-white">
            <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-200">
              Expense summary
            </p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <strong>{form.title || "Untitled expense"}</strong>
                <p className="mt-1 text-sm text-emerald-100/70">
                  {selected?.name || "No category"} · {form.paymentMethod} ·{" "}
                  {date(form.expenseDate)}
                </p>
              </div>
              <strong className="text-2xl">{money(form.amount)}</strong>
            </div>
          </section>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? (
                <LoaderCircle className="loading-shimmer-icon" size={17} />
              ) : (
                <CircleDollarSign size={17} />
              )}{" "}
              {saving ? "Saving…" : "Save expense"}
            </button>
          </div>
        </div>
      </form>
      {categoryForm && (
        <CategoryForm
          onClose={() => setCategoryForm(false)}
          onSaved={(category) => {
            setCategories((current) => [...current, category]);
            setForm({ ...form, categoryId: category._id });
            setCategoryForm(false);
          }}
        />
      )}
    </div>
  );
}

function ExpenseDrawer({ expense, onClose, onEdit, onDuplicate, onVoid }) {
  const router = useRouter(),
    purchase = expense.purchase;
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/35"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--line)] p-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Expense details
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">
              {expense.title || expense.description || "Expense"}
            </h2>
            <div className="mt-2 flex gap-2">
              <Badge value={expense.source} />
              <Badge value={expense.status || "ACTIVE"} />
            </div>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-2xl bg-[#f3f6f1] p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
              {expense.expenseNumber || "Legacy expense"}
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              {money(expense.accountAmount)}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {date(expense.expenseDate, true)}
            </p>
          </div>
          {expense.source === "PURCHASE" ? (
            <section className="mt-6 space-y-4">
              <p className="label">Linked purchase</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="label">Purchase</span>
                  <strong>{purchase?.purchaseNumber || "—"}</strong>
                </div>
                <div>
                  <span className="label">Supplier</span>
                  <strong>{purchase?.supplierSnapshot?.name || "—"}</strong>
                </div>
                <div>
                  <span className="label">Supplier invoice</span>
                  <strong>{purchase?.supplierInvoiceNumber || "—"}</strong>
                </div>
                <div>
                  <span className="label">Purchase date</span>
                  <strong>{date(purchase?.purchasedAt)}</strong>
                </div>
                <div>
                  <span className="label">Purchase total</span>
                  <strong>{money(expense.amount)}</strong>
                </div>
                <div>
                  <span className="label">Amount paid</span>
                  <strong>{money(expense.paidAmount ?? expense.amount)}</strong>
                </div>
                <div>
                  <span className="label">Balance due</span>
                  <strong className="text-amber-700">
                    {money(expense.balanceDue)}
                  </strong>
                </div>
                <div>
                  <span className="label">Payment</span>
                  <strong>
                    {purchase?.paymentStatus || expense.paymentMethod}
                  </strong>
                </div>
              </div>
              <p className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
                This expense is managed by its linked purchase and cannot be
                edited or voided here.
              </p>
            </section>
          ) : (
            <section className="mt-6">
              <p className="label">Expense details</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="label">Category</span>
                  <strong>{expense.category}</strong>
                </div>
                <div>
                  <span className="label">Payment method</span>
                  <strong>{expense.paymentMethod}</strong>
                </div>
                <div>
                  <span className="label">Description</span>
                  <p>{expense.description || "—"}</p>
                </div>
                <div>
                  <span className="label">Payment reference</span>
                  <p>{expense.paymentReference || "—"}</p>
                </div>
                <div>
                  <span className="label">Paid to</span>
                  <p>{expense.paidTo || "—"}</p>
                </div>
                {(expense.staffId || expense.staffSnapshot) && (
                  <div>
                    <span className="label">Employee</span>
                    <strong>
                      {expense.staffId?.name || expense.staffSnapshot?.name}
                    </strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {expense.staffId?.email ||
                        expense.staffSnapshot?.email ||
                        ""}
                    </p>
                  </div>
                )}
                <div>
                  <span className="label">Recorded by</span>
                  <strong>
                    {expense.actorId?.name ||
                      expense.creatorSnapshot?.name ||
                      "System"}
                  </strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="label">Notes</span>
                  <p>{expense.notes || "—"}</p>
                </div>
              </div>
            </section>
          )}
          <section className="mt-6 border-t border-[var(--line)] pt-5">
            <p className="label">Audit</p>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <span>
                <small className="block text-[var(--muted)]">Created</small>
                {date(expense.createdAt, true)}
              </span>
              <span>
                <small className="block text-[var(--muted)]">
                  Last updated
                </small>
                {date(expense.updatedAt, true)}
              </span>
              {expense.editedBy && (
                <span>
                  <small className="block text-[var(--muted)]">Edited by</small>
                  {expense.editedBy.name}
                </span>
              )}
              {expense.status === "VOID" && (
                <>
                  <span>
                    <small className="block text-[var(--muted)]">Voided</small>
                    {date(expense.voidedAt, true)}
                  </span>
                  <span className="sm:col-span-2">
                    <small className="block text-[var(--muted)]">
                      Void reason
                    </small>
                    {expense.voidReason}
                  </span>
                </>
              )}
            </div>
          </section>
          <section className="mt-6 rounded-xl border border-[var(--line)] p-4">
            <div className="flex items-center gap-2">
              <Landmark size={18} className="text-[var(--green)]" />
              <strong>Linked Accounts movement</strong>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {expense.status === "VOID"
                ? "This outflow is void and excluded from Accounts totals."
                : `${expense.expenseNumber || expense.category} · ${expense.paymentMethod} cash out · ${money(expense.accountAmount)}`}
            </p>
          </section>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] p-4">
          <button className="btn" onClick={() => router.push("/accounts")}>
            View account transaction
          </button>
          {expense.source === "PURCHASE" ? (
            <button
              className="btn btn-primary"
              onClick={() =>
                router.push(
                  `/purchases?search=${encodeURIComponent(purchase?.purchaseNumber || "")}`,
                )
              }
            >
              View purchase
            </button>
          ) : (
            expense.status !== "VOID" && (
              <>
                <button className="btn" onClick={() => onDuplicate(expense)}>
                  <Copy size={16} />
                  Duplicate
                </button>
                <button className="btn" onClick={() => onEdit(expense)}>
                  <Pencil size={16} />
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => onVoid(expense)}
                >
                  <RotateCcw size={16} />
                  Void
                </button>
              </>
            )
          )}
        </footer>
      </aside>
    </div>
  );
}

function VoidModal({ expense, onClose, onVoided }) {
  const [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      const result = await api(`/api/expenses/${expense._id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      toast.success("Expense voided successfully.");
      onVoided(result);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4">
      <div className="card w-full max-w-md p-6">
        <AlertTriangle className="text-amber-600" />
        <h3 className="mt-3 text-xl font-extrabold">Void expense?</h3>
        <p className="mt-2 font-bold">
          {expense.title} · {money(expense.accountAmount || expense.amount)}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          The record remains in history and its linked Accounts outflow will be
          excluded from financial totals.
        </p>
        <label className="mt-4 block">
          <span className="label">Reason *</span>
          <textarea
            className="field min-h-20"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={saving || !reason.trim()}
            onClick={submit}
          >
            {saving ? "Voiding…" : "Void expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExpensesWorkspace() {
  const router = useRouter();
  const [data, setData] = useState(null),
    [categories, setCategories] = useState([]),
    [staff, setStaff] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [quick, setQuick] = useState("all"),
    [filters, setFilters] = useState({
      category: [],
      paymentMethod: [],
      staff: [],
      source: "",
      status: [],
      dateFrom: "",
      dateTo: "",
      sort: "date",
      order: "desc",
    }),
    [page, setPage] = useState(1),
    [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [detailLoading, setDetailLoading] = useState(false),
    [manageCategories, setManageCategories] = useState(false),
    [voidTarget, setVoidTarget] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      search: debouncedSearch,
      page: String(page),
      limit: "20",
      ...Object.fromEntries(serializedFilterEntries(filters)),
    });
    api(`/api/expenses?${params}`)
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((failure) => active && setError(failure.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debouncedSearch, filters, page]);
  useEffect(() => {
    Promise.all([
      api("/api/expense-categories?includeInactive=true"),
      api("/api/staff/options"),
    ])
      .then(([categoryRows, staffRows]) => {
        setCategories(categoryRows);
        setStaff(staffRows);
      })
      .catch((failure) => toast.error(failure.message));
  }, []);
  function reload() {
    setFilters((current) => ({ ...current }));
  }
  async function openDetail(row) {
    setDetailLoading(true);
    try {
      setDetail(await api(`/api/expenses/${row._id}`));
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setDetailLoading(false);
    }
  }
  function range(type) {
    const now = new Date(),
      from = new Date(now),
      to = new Date(now);
    if (type === "week") from.setDate(now.getDate() - 6);
    else if (type === "month") from.setDate(1);
    setQuick(type);
    setPage(1);
    setFilters((current) => ({
      ...current,
      dateFrom: type === "all" ? "" : inputDate(from),
      dateTo: type === "all" ? "" : inputDate(to),
    }));
  }
  function edit(row) {
    if (row.source !== "MANUAL") return;
    setDetail(null);
    setForm({
      ...emptyForm(),
      ...row,
      categoryId: row.categoryId?._id || row.categoryId || "",
      staffId: row.staffId?._id || row.staffId || "",
      expenseDate: row.expenseDate?.slice(0, 10) || TODAY,
    });
  }
  function duplicate(row) {
    setDetail(null);
    setForm({
      ...emptyForm(),
      categoryId: row.categoryId?._id || row.categoryId || "",
      staffId: row.staffId?._id || row.staffId || "",
      title: `${row.title || row.description} (copy)`,
      description: row.description || "",
      amount: row.amount,
      paymentMethod: row.paymentMethod,
      paymentReference: "",
      paidTo: row.paidTo || "",
      notes: row.notes || "",
    });
  }
  async function exportCsv() {
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: "1",
        limit: "1000",
        ...Object.fromEntries(serializedFilterEntries(filters)),
      });
      const result = await api(`/api/expenses?${params}`);
      const headers = [
        "Expense Number",
        "Date",
        "Title",
        "Category",
        "Description",
        "Staff",
        "Source",
        "Payment Method",
        "Reference",
        "Amount",
        "Status",
        "Purchase Number",
      ];
      const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [
        headers,
        ...result.rows.map((row) => [
          row.expenseNumber,
          row.expenseDate,
          row.title || row.description,
          row.category,
          row.description,
          row.staffId?.name ||
            row.staffSnapshot?.name ||
            row.actorId?.name ||
            row.creatorSnapshot?.name,
          row.source,
          row.paymentMethod,
          row.paymentReference,
          row.accountAmount,
          row.status || "ACTIVE",
          row.purchase?.purchaseNumber,
        ]),
      ]
        .map((line) => line.map(cell).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `expenses-${TODAY}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Expenses exported.");
    } catch (failure) {
      toast.error(failure.message);
    }
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const rows = data?.rows || [],
    kpis = data?.kpis || {},
    monthLabel = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric",
    }).format(new Date());
  const maxCategory = Math.max(
    1,
    ...(data?.categoryBreakdown || []).map((entry) => Number(entry.value)),
  );
  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
            Cash outflow
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Expenses</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Track operating expenses, purchase-related costs and outgoing
            payments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportCsv}>
            <ArrowDownToLine size={17} />
            Export
          </button>
          <button className="btn" onClick={() => setManageCategories(true)}>
            <FolderCog size={17} />
            Manage categories
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setForm(emptyForm())}
          >
            <Plus size={18} />
            Add expense
          </button>
        </div>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Today's expenses",
            value: kpis.today,
            note: `${kpis.todayCount || 0} transactions · Today`,
            icon: CalendarDays,
          },
          {
            label: "This month",
            value: kpis.month,
            note: `${kpis.monthCount || 0} transactions · ${monthLabel}`,
            icon: CircleDollarSign,
          },
          {
            label: "Manual expenses",
            value: kpis.manual,
            note: `Operating costs · ${monthLabel}`,
            icon: ReceiptText,
          },
          {
            label: "Purchase expenses",
            value: kpis.purchase,
            note: `Paid supplier costs · ${monthLabel}`,
            icon: ShoppingBag,
          },
        ].map(({ label, value, note, icon: Icon }) => (
          <div className="card p-5" key={label}>
            <div className="mb-4 flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
                <Icon size={19} />
              </span>
              <span className="text-xs font-bold text-[var(--muted)]">
                Live
              </span>
            </div>
            <p className="text-sm font-bold text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">
              {loading ? "—" : money(value)}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
          </div>
        ))}
      </div>
      {data?.categoryBreakdown?.length > 0 && (
        <section className="card mb-5 p-5">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[var(--green)]" />
            <h2 className="font-extrabold">Expenses by category</h2>
            <span className="ml-auto text-xs font-bold text-[var(--muted)]">
              {monthLabel}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.categoryBreakdown.map((entry) => (
              <div key={entry.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-bold">{entry.name}</span>
                  <span>{money(entry.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--green)]"
                    style={{
                      width: `${Math.max(4, (entry.value / maxCategory) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card mb-5 p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-3.5 text-[var(--muted)]"
            size={18}
          />
          <input
            className="field !pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search description, category, payment reference, purchase ID or staff…"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
          ].map(([value, label]) => (
            <button
              className={`btn !min-h-9 ${quick === value ? "btn-primary" : ""}`}
              key={value}
              onClick={() => range(value)}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 hidden h-9 border-l border-[var(--line)] sm:block" />
          {[
            ["", "All sources"],
            ["MANUAL", "Manual"],
            ["PURCHASE", "Purchase"],
          ].map(([value, label]) => (
            <button
              className={`btn !min-h-9 ${filters.source === value ? "bg-slate-100" : ""}`}
              key={label}
              onClick={() => {
                setPage(1);
                setFilters({ ...filters, source: value });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MultiSelectFilter
            label="Categories"
            placeholder="All categories"
            clearLabel="All categories"
            values={filters.category}
            options={categories.map((category) => ({
              value: category.name,
              label: category.name,
            }))}
            onChange={(values) => {
              setPage(1);
              setFilters({ ...filters, category: values });
            }}
          />
          <MultiSelectFilter
            label="Payments"
            placeholder="All payments"
            clearLabel="All payments"
            values={filters.paymentMethod}
            options={(
              data?.paymentMethods || ["CASH", "UPI", "CARD", "BANK"]
            ).map((method) => ({ value: method, label: method }))}
            onChange={(values) => {
              setPage(1);
              setFilters({ ...filters, paymentMethod: values });
            }}
          />
          <MultiSelectFilter
            label="Staff"
            placeholder="All staff"
            clearLabel="All staff"
            values={filters.staff}
            options={staff.map((user) => ({
              value: user._id,
              label: user.name,
            }))}
            onChange={(values) => {
              setPage(1);
              setFilters({ ...filters, staff: values });
            }}
          />
          <MultiSelectFilter
            label="Statuses"
            placeholder="All statuses"
            clearLabel="All statuses"
            values={filters.status}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "VOID", label: "Void" },
            ]}
            onChange={(values) => {
              setPage(1);
              setFilters({ ...filters, status: values });
            }}
          />
          <input
            className="field"
            type="date"
            aria-label="From date"
            value={filters.dateFrom}
            onChange={(event) => {
              setQuick("custom");
              setPage(1);
              setFilters({ ...filters, dateFrom: event.target.value });
            }}
          />
          <div className="flex gap-2">
            <select
              className="field"
              value={`${filters.sort}:${filters.order}`}
              onChange={(event) => {
                const [sort, order] = event.target.value.split(":");
                setFilters({ ...filters, sort, order });
              }}
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="amount:desc">Highest amount</option>
              <option value="amount:asc">Lowest amount</option>
              <option value="category:asc">Category A–Z</option>
              <option value="source:asc">Source</option>
            </select>
            <button
              className="btn !px-3"
              onClick={() => {
                setSearch("");
                setQuick("all");
                setPage(1);
                setFilters({
                  category: [],
                  paymentMethod: [],
                  staff: [],
                  source: "",
                  status: [],
                  dateFrom: "",
                  dateTo: "",
                  sort: "date",
                  order: "desc",
                });
              }}
              title="Clear filters"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      </section>
      {error ? (
        <div className="card grid min-h-72 place-items-center p-8 text-center">
          <div>
            <AlertTriangle className="mx-auto text-[var(--red)]" />
            <h2 className="mt-3 font-extrabold">Unable to load expenses</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            <button className="btn mt-4" onClick={reload}>
              Retry
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="card p-5">
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                className="h-16 loading-shimmer rounded-xl bg-slate-100"
                key={index}
              />
            ))}
          </div>
        </div>
      ) : rows.length ? (
        <>
          <div className="card table-wrap hidden lg:block">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Staff</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Status / Link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className={`cursor-pointer hover:bg-[#f8faf7] ${row.status === "VOID" ? "opacity-55" : ""}`}
                    key={row._id}
                    onClick={() => openDetail(row)}
                  >
                    <td>{date(row.expenseDate, true)}</td>
                    <td>
                      <strong>
                        {row.title || row.description || "Expense"}
                      </strong>
                      <p className="mt-1 max-w-56 truncate text-xs text-[var(--muted)]">
                        {row.source === "PURCHASE"
                          ? `${row.purchase?.purchaseNumber || row.expenseNumber} · ${row.purchase?.supplierSnapshot?.name || "Supplier"}`
                          : row.description || row.expenseNumber}
                      </p>
                    </td>
                    <td>
                      <strong>{row.category}</strong>
                    </td>
                    <td>
                      <Badge value={row.source} />
                    </td>
                    <td>
                      <strong>
                        {row.staffId?.name ||
                          row.staffSnapshot?.name ||
                          row.actorId?.name ||
                          row.creatorSnapshot?.name ||
                          "System"}
                      </strong>
                    </td>
                    <td>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-extrabold">
                        {row.paymentMethod}
                      </span>
                      {row.paymentReference && (
                        <p className="mt-1 max-w-24 truncate text-xs text-[var(--muted)]">
                          {row.paymentReference}
                        </p>
                      )}
                    </td>
                    <td>
                      <strong className="text-base">
                        {money(row.accountAmount)}
                      </strong>
                      {row.source === "PURCHASE" &&
                        Number(row.balanceDue) > 0 && (
                          <p className="mt-1 text-xs font-bold text-amber-700">
                            {money(row.balanceDue)} due
                          </p>
                        )}
                    </td>
                    <td>
                      {row.status === "VOID" ? (
                        <Badge value="VOID" />
                      ) : row.source === "PURCHASE" ? (
                        <button
                          className="text-xs font-extrabold text-indigo-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.location.assign(
                              `/purchases?search=${encodeURIComponent(row.purchase?.purchaseNumber || "")}`,
                            );
                          }}
                        >
                          Linked purchase
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-[var(--muted)]">
                          Recorded
                        </span>
                      )}
                    </td>
                    <td>
                      <ActionMenu
                        row={row}
                        onView={() => openDetail(row)}
                        onEdit={() => edit(row)}
                        onDuplicate={() => duplicate(row)}
                        onVoid={() => setVoidTarget(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <article
                className={`card p-4 ${row.status === "VOID" ? "opacity-55" : ""}`}
                key={row._id}
                onClick={() => openDetail(row)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{row.title || row.description}</strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {row.category} · {row.source}
                    </p>
                  </div>
                  <ActionMenu
                    row={row}
                    onView={() => openDetail(row)}
                    onEdit={() => edit(row)}
                    onDuplicate={() => duplicate(row)}
                    onVoid={() => setVoidTarget(row)}
                  />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div className="text-sm text-[var(--muted)]">
                    <p>{date(row.expenseDate)}</p>
                    <p className="mt-1">
                      {row.paymentMethod} ·{" "}
                      {row.staffId?.name ||
                        row.staffSnapshot?.name ||
                        row.actorId?.name ||
                        row.creatorSnapshot?.name ||
                        "System"}
                    </p>
                  </div>
                  <strong className="text-lg">
                    {money(row.accountAmount)}
                  </strong>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
            <p className="text-[var(--muted)]">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
              {Math.min(
                data.pagination.page * data.pagination.limit,
                data.pagination.total,
              )}{" "}
              of {data.pagination.total} expenses
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn !min-h-9 !px-3"
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
                className="btn !min-h-9 !px-3"
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
        <div className="card grid min-h-72 place-items-center p-8 text-center">
          <div>
            <ReceiptText className="mx-auto text-[var(--green)]" size={36} />
            <h2 className="mt-4 text-lg font-extrabold">
              {debouncedSearch ||
              filters.category.length ||
              filters.paymentMethod.length ||
              filters.source ||
              filters.status.length
                ? "No expenses found"
                : "No expenses yet"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {debouncedSearch ||
              filters.category.length ||
              filters.paymentMethod.length ||
              filters.source ||
              filters.status.length
                ? "Try changing your search or filters."
                : "Manual expenses and linked purchase expenses will appear here."}
            </p>
            <button
              className="btn btn-primary mt-5"
              onClick={() => setForm(emptyForm())}
            >
              <Plus size={17} />
              Add expense
            </button>
          </div>
        </div>
      )}
      {form && (
        <ExpenseForm
          initial={form._id ? form : null}
          categories={categories}
          setCategories={setCategories}
          staff={staff}
          paymentMethods={
            data?.paymentMethods || ["CASH", "UPI", "CARD", "BANK"]
          }
          onClose={() => setForm(null)}
          onSaved={(expense) => {
            setForm(null);
            reload();
            openDetail(expense);
          }}
        />
      )}
      {detailLoading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/35 text-white">
          <LoaderCircle className="loading-shimmer-icon" />
          <span className="mt-2">Loading expense…</span>
        </div>
      )}
      {detail && (
        <ExpenseDrawer
          expense={detail}
          onClose={() => setDetail(null)}
          onEdit={edit}
          onDuplicate={duplicate}
          onVoid={(expense) => setVoidTarget(expense)}
        />
      )}{" "}
      {manageCategories && (
        <CategoriesManager
          categories={categories}
          setCategories={setCategories}
          onClose={() => setManageCategories(false)}
        />
      )}{" "}
      {voidTarget && (
        <VoidModal
          expense={voidTarget}
          onClose={() => setVoidTarget(null)}
          onVoided={(expense) => {
            setVoidTarget(null);
            setDetail(expense);
            reload();
          }}
        />
      )}
    </>
  );
}
