"use client";

import { useEffect, useState } from "react";
import {
  CircleDollarSign,
  Edit3,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

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
async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.data;
}
function Heading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[.16em] text-(--green)">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-(--muted)">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={`card max-h-[94vh] w-full overflow-y-auto p-6 ${wide ? "max-w-4xl" : "max-w-lg"}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Empty({ icon: Icon, title, body }) {
  return (
    <div className="card grid min-h-64 place-items-center p-8 text-center">
      <div>
        <Icon className="mx-auto text-(--green)" />
        <h2 className="mt-4 font-extrabold">{title}</h2>
        <p className="mt-2 text-sm text-(--muted)">{body}</p>
      </div>
    </div>
  );
}

export function SuppliersWorkspace() {
  const confirmAction = useConfirm();
  const [rows, setRows] = useState([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(null),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false);
  async function load() {
    try {
      setRows(
        await api(
          `/api/suppliers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
        ),
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    api("/api/suppliers")
      .then(setRows)
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(editing ? `/api/suppliers/${editing._id}` : "/api/suppliers", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(editing ? "Supplier updated" : "Supplier created");
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(row) {
    if (!await confirmAction({ title: `Delete ${row.name}?`, description: "Purchase history will be preserved by archiving suppliers that are already in use.", confirmText: "Delete", cancelText: "Cancel", variant: "danger" }))
      return;
    try {
      const result = await api(`/api/suppliers/${row._id}`, {
        method: "DELETE",
      });
      toast.success(
        result.archived
          ? "Supplier archived; purchase history preserved"
          : "Supplier deleted",
      );
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Purchase partners"
        title="Suppliers"
        description="Supplier contacts and inventory purchase totals."
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={18} />
            Add supplier
          </button>
        }
      />
      <div className="mb-5 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-3 text-(--muted)"
            size={18}
          />
          <input
            className="field pl-10!"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search supplier"
          />
        </div>
        <button className="btn" onClick={load}>
          Search
        </button>
      </div>
      {loading ? (
        <div className="card grid min-h-64 place-items-center">
          <LoaderCircle className="loading-shimmer-icon" />
        </div>
      ) : rows.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Purchases</th>
                <th>Total purchased</th>
                <th>Last purchase</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.name}</strong>
                    {row.taxNumber && (
                      <p className="text-xs text-(--muted)">
                        Tax: {row.taxNumber}
                      </p>
                    )}
                  </td>
                  <td>{row.phone || row.email || "—"}</td>
                  <td>{row.purchaseCount}</td>
                  <td className="font-extrabold text-(--green)">
                    {money(row.totalPurchased)}
                  </td>
                  <td>{date(row.lastPurchaseAt)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn min-h-9! p-2!"
                        aria-label={`Edit ${row.name}`}
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        className="btn btn-danger min-h-9! p-2!"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => remove(row)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Truck}
          title="No suppliers yet"
          body="Add a supplier before recording an inventory purchase."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit supplier" : "Add supplier"}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <label>
              <span className="label">Supplier name</span>
              <input
                className="field"
                name="name"
                defaultValue={editing?.name}
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Phone</span>
                <input
                  className="field"
                  name="phone"
                  defaultValue={editing?.phone}
                />
              </label>
              <label>
                <span className="label">Email</span>
                <input
                  className="field"
                  type="email"
                  name="email"
                  defaultValue={editing?.email}
                />
              </label>
            </div>
            <label>
              <span className="label">Tax / GST number</span>
              <input
                className="field"
                name="taxNumber"
                defaultValue={editing?.taxNumber}
              />
            </label>
            <label>
              <span className="label">Address</span>
              <textarea
                className="field min-h-20"
                name="address"
                defaultValue={editing?.address}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save supplier"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

const blankPurchaseItem = () => ({
  productId: "",
  batchNumber: "",
  expiryDate: "",
  packageQuantity: "1",
  unitCost: "",
});
export function PurchasesWorkspace() {
  const confirmAction = useConfirm();
  const [rows, setRows] = useState([]),
    [suppliers, setSuppliers] = useState([]),
    [products, setProducts] = useState([]),
    [open, setOpen] = useState(false),
    [items, setItems] = useState([blankPurchaseItem()]),
    [saving, setSaving] = useState(false),
    [editing, setEditing] = useState(null),
    [detail, setDetail] = useState(null),
    [supplierId, setSupplierId] = useState(""),
    [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(""),
    [purchasedAt, setPurchasedAt] = useState(""),
    [paymentMethod, setPaymentMethod] = useState("CASH"),
    [paymentReference, setPaymentReference] = useState("");
  async function load() {
    try {
      const [purchaseRows, supplierRows, productRows] = await Promise.all([
        api("/api/purchases"),
        api("/api/suppliers"),
        api("/api/products"),
      ]);
      setRows(purchaseRows);
      setSuppliers(supplierRows);
      setProducts(productRows);
    } catch (error) {
      toast.error(error.message);
    }
  }
  useEffect(() => {
    Promise.all([
      api("/api/purchases"),
      api("/api/suppliers"),
      api("/api/products"),
    ])
      .then(([purchaseRows, supplierRows, productRows]) => {
        setRows(purchaseRows);
        setSuppliers(supplierRows);
        setProducts(productRows);
      })
      .catch((error) => toast.error(error.message));
  }, []);
  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.packageQuantity || 0) * Number(item.unitCost || 0),
    0,
  );
  function changeItem(index, changes) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    );
  }
  function startNew() {
    setEditing(null);
    setSupplierId("");
    setSupplierInvoiceNumber("");
    setPurchasedAt("");
    setPaymentMethod("CASH");
    setPaymentReference("");
    setItems([blankPurchaseItem()]);
    setOpen(true);
  }
  function startEdit(row) {
    setEditing(row);
    setSupplierId(row.supplierId?._id || row.supplierId || "");
    setSupplierInvoiceNumber(row.supplierInvoiceNumber || "");
    setPurchasedAt(row.purchasedAt?.slice(0, 10) || "");
    setPaymentMethod(row.paymentMethod || "CASH");
    setPaymentReference(row.paymentReference || "");
    setItems(
      row.items.map((item) => ({
        productId: item.productId?._id || item.productId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate?.slice(0, 10) || "",
        packageQuantity: String(item.packageQuantity),
        unitCost: String(item.unitCost),
      })),
    );
    setOpen(true);
  }
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `/api/purchases/${editing._id}` : "/api/purchases", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          supplierInvoiceNumber,
          purchasedAt,
          paymentMethod,
          paymentReference,
          items,
        }),
      });
      toast.success(
        editing
          ? "Purchase and linked expense updated"
          : "Purchase saved, stock received, and Purchase expense added",
      );
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function openDetail(row) {
    try {
      setDetail(await api(`/api/purchases/${row._id}`));
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function remove(row) {
    if (
      !await confirmAction({ title: `Delete ${row.purchaseNumber}?`, description: "Stock and its linked expense will also be reversed.", confirmText: "Delete", cancelText: "Cancel", variant: "danger" })
    )
      return;
    try {
      await api(`/api/purchases/${row._id}`, { method: "DELETE" });
      toast.success("Purchase, stock receipt, and linked expense deleted");
      setDetail(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Inventory receiving"
        title="Purchases"
        description="Every completed purchase receives stock and creates one linked Purchase expense."
        action={
          <button className="btn btn-primary" onClick={startNew}>
            <Plus size={18} />
            New purchase
          </button>
        }
      />
      {rows.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Supplier invoice</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="cursor-pointer hover:bg-[#f8faf7]"
                  key={row._id}
                  onClick={() => openDetail(row)}
                >
                  <td className="font-extrabold">{row.purchaseNumber}</td>
                  <td>{date(row.purchasedAt)}</td>
                  <td>{row.supplierId?.name || row.supplierSnapshot?.name}</td>
                  <td>{row.supplierInvoiceNumber || "—"}</td>
                  <td>{row.items.length}</td>
                  <td>
                    <span className="pill">{row.paymentMethod}</span>
                  </td>
                  <td className="font-extrabold">{money(row.total)}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        className="btn min-h-9! p-2!"
                        onClick={() => startEdit(row)}
                        aria-label="Edit purchase"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        className="btn btn-danger min-h-9! p-2!"
                        onClick={() => remove(row)}
                        aria-label="Delete purchase"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Upload}
          title="No purchases recorded"
          body="Record the first supplier purchase to receive inventory."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit purchase" : "Receive purchase"}
          onClose={() => setOpen(false)}
          wide
        >
          <form onSubmit={save}>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="label">Supplier</span>
                <select
                  className="field"
                  name="supplierId"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Supplier invoice number</span>
                <input
                  className="field"
                  value={supplierInvoiceNumber}
                  onChange={(event) =>
                    setSupplierInvoiceNumber(event.target.value)
                  }
                />
              </label>
              <label>
                <span className="label">Purchase date</span>
                <input
                  className="field"
                  type="date"
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                />
              </label>
              <label>
                <span className="label">Payment method</span>
                <select
                  className="field"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  required
                >
                  <option>CASH</option>
                  <option>UPI</option>
                  <option>CARD</option>
                  <option>BANK</option>
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="label">Payment reference</span>
                <input
                  className="field"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold">Purchase items</h3>
                <button
                  type="button"
                  className="btn min-h-9!"
                  onClick={() =>
                    setItems((current) => [...current, blankPurchaseItem()])
                  }
                >
                  <Plus size={15} />
                  Add row
                </button>
              </div>
              {items.map((item, index) => (
                <div
                  className="grid gap-3 rounded-xl border border-(--line) p-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
                  key={index}
                >
                  <label>
                    <span className="label">Product</span>
                    <select
                      className="field"
                      value={item.productId}
                      onChange={(event) =>
                        changeItem(index, { productId: event.target.value })
                      }
                      required
                    >
                      <option value="">Select</option>
                      {products.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name} ({product.packageType})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">Batch</span>
                    <input
                      className="field"
                      value={item.batchNumber}
                      onChange={(event) =>
                        changeItem(index, { batchNumber: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span className="label">Expiry</span>
                    <input
                      className="field"
                      type="date"
                      value={item.expiryDate}
                      onChange={(event) =>
                        changeItem(index, { expiryDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Packages</span>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      step="1"
                      value={item.packageQuantity}
                      onChange={(event) =>
                        changeItem(index, {
                          packageQuantity: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span className="label">Cost each</span>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step=".01"
                      value={item.unitCost}
                      onChange={(event) =>
                        changeItem(index, { unitCost: event.target.value })
                      }
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-6 text-(--red)"
                    aria-label="Remove purchase item"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col items-end gap-4">
              <div className="text-xl">
                <span className="mr-4 text-(--muted)">Purchase total</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="loading-shimmer-icon" size={17} />
                  ) : (
                    <Upload size={17} />
                  )}{" "}
                  {editing ? "Save changes" : "Complete purchase"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.purchaseNumber}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="label">Supplier</span>
              <strong>
                {detail.supplierId?.name || detail.supplierSnapshot?.name}
              </strong>
              <p className="text-sm text-(--muted)">
                {detail.supplierId?.phone || ""}
              </p>
            </div>
            <div>
              <span className="label">Purchase date</span>
              <strong>{date(detail.purchasedAt)}</strong>
            </div>
            <div>
              <span className="label">Payment</span>
              <strong>{detail.paymentMethod}</strong>
              <p className="text-sm text-(--muted)">
                {detail.paymentReference || "No reference"}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-(--line)">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Packages</th>
                  <th>Unit cost</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item, index) => (
                  <tr key={index}>
                    <td className="font-bold">{item.name}</td>
                    <td>{item.batchNumber}</td>
                    <td>{date(item.expiryDate)}</td>
                    <td>{item.packageQuantity}</td>
                    <td>{money(item.unitCost)}</td>
                    <td className="font-extrabold">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <strong className="text-xl">Total {money(detail.total)}</strong>
            <div className="flex gap-2">
              <button
                className="btn"
                onClick={() => {
                  setDetail(null);
                  startEdit(detail);
                }}
              >
                <Edit3 size={16} />
                Edit
              </button>
              <button className="btn btn-danger" onClick={() => remove(detail)}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ExpensesWorkspace() {
  const confirmAction = useConfirm();
  const [rows, setRows] = useState([]),
    [categories, setCategories] = useState([]),
    [staff, setStaff] = useState([]),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState(null),
    [saving, setSaving] = useState(false),
    [category, setCategory] = useState(""),
    [staffId, setStaffId] = useState(""),
    [addingCategory, setAddingCategory] = useState(false);
  async function load() {
    try {
      const [expenseRows, categoryRows, staffRows] = await Promise.all([
        api("/api/expenses"),
        api("/api/expense-categories"),
        api("/api/staff/options"),
      ]);
      setRows(expenseRows);
      setCategories(categoryRows);
      setStaff(staffRows);
    } catch (error) {
      toast.error(error.message);
    }
  }
  useEffect(() => {
    Promise.all([
      api("/api/expenses"),
      api("/api/expense-categories"),
      api("/api/staff/options"),
    ])
      .then(([expenseRows, categoryRows, staffRows]) => {
        setRows(expenseRows);
        setCategories(categoryRows);
        setStaff(staffRows);
      })
      .catch((error) => toast.error(error.message));
  }, []);
  function startEdit(row = null) {
    setEditing(row);
    setCategory(row?.category || "");
    setStaffId(row?.staffId?._id || "");
    setOpen(true);
  }
  async function save(event) {
    event.preventDefault();
    if (!category) return toast.error("Select an expense category");
    if (category.toLowerCase() === "salary" && !staffId)
      return toast.error("Select a staff member");
    setSaving(true);
    const body = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      category,
      staffId,
    };
    try {
      await api(editing ? `/api/expenses/${editing._id}` : "/api/expenses", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(editing ? "Expense updated" : "Expense added");
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function addCategory(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await api("/api/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setCategories((current) => [...current, created]);
      setCategory(created.name);
      setAddingCategory(false);
      toast.success("Category created and selected");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(row) {
    if (!await confirmAction({ title: `Delete ${row.description}?`, description: "This action cannot be undone.", confirmText: "Delete", cancelText: "Cancel", variant: "danger" })) return;
    try {
      await api(`/api/expenses/${row._id}`, { method: "DELETE" });
      toast.success("Expense deleted");
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  const selectedStaff = staff.find((entry) => entry._id === staffId);
  return (
    <>
      <Heading
        eyebrow="Cash outflow"
        title="Expenses"
        description="Manual operating expenses and automatic purchase expenses in one register."
        action={
          <button className="btn btn-primary" onClick={() => startEdit()}>
            <Plus size={18} />
            Add expense
          </button>
        }
      />
      {rows.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Staff</th>
                <th>Source</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>{date(row.expenseDate)}</td>
                  <td className="font-bold">{row.category}</td>
                  <td>{row.description}</td>
                  <td>{row.staffId?.name || row.staffSnapshot?.name || "—"}</td>
                  <td>
                    <span className="pill">{row.source}</span>
                  </td>
                  <td>{row.paymentMethod}</td>
                  <td className="font-extrabold text-(--red)">
                    {money(row.amount)}
                  </td>
                  <td>
                    {row.source === "MANUAL" ? (
                      <div className="flex gap-1">
                        <button
                          className="btn min-h-9! p-2!"
                          onClick={() => startEdit(row)}
                          aria-label="Edit expense"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="btn btn-danger min-h-9! p-2!"
                          onClick={() => remove(row)}
                          aria-label="Delete expense"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-(--muted)">
                        Linked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={ReceiptText}
          title="No expenses yet"
          body="Manual expenses and completed purchases will appear here."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit expense" : "Add expense"}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <label>
              <span className="label">Category</span>
              <select
                className="field"
                value={category}
                onChange={(event) => {
                  if (event.target.value === "__add__") setAddingCategory(true);
                  else {
                    setCategory(event.target.value);
                    if (event.target.value.toLowerCase() !== "salary")
                      setStaffId("");
                  }
                }}
                required
              >
                <option value="">Select category</option>
                {categories.map((entry) => (
                  <option key={entry._id || entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
                <option value="__add__">+ Add category</option>
              </select>
            </label>
            {category.toLowerCase() === "salary" && (
              <>
                <label>
                  <span className="label">Staff</span>
                  <select
                    className="field"
                    value={staffId}
                    onChange={(event) => setStaffId(event.target.value)}
                    required
                  >
                    <option value="">Select staff member</option>
                    {staff.map((entry) => (
                      <option key={entry._id} value={entry._id}>
                        {entry.name} — {entry.email}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedStaff && (
                  <div className="rounded-xl bg-[#f3f6f1] p-4 text-sm">
                    <strong>{selectedStaff.name}</strong>
                    <p className="mt-1 text-(--muted)">
                      {selectedStaff.email} · {selectedStaff.role} ·{" "}
                      {selectedStaff.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                )}
              </>
            )}
            <label>
              <span className="label">Description</span>
              <input
                className="field"
                name="description"
                defaultValue={editing?.description}
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Amount</span>
                <input
                  className="field"
                  name="amount"
                  type="number"
                  min=".01"
                  step=".01"
                  defaultValue={editing?.amount}
                  required
                />
              </label>
              <label>
                <span className="label">Date</span>
                <input
                  className="field"
                  name="expenseDate"
                  type="date"
                  defaultValue={editing?.expenseDate?.slice?.(0, 10)}
                />
              </label>
              <label>
                <span className="label">Payment method</span>
                <select
                  className="field"
                  name="paymentMethod"
                  defaultValue={editing?.paymentMethod || "CASH"}
                >
                  <option>CASH</option>
                  <option>UPI</option>
                  <option>CARD</option>
                  <option>BANK</option>
                </select>
              </label>
              <label>
                <span className="label">Payment reference</span>
                <input
                  className="field"
                  name="paymentReference"
                  defaultValue={editing?.paymentReference}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save expense"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {addingCategory && (
        <div className="fixed inset-0 z-70 grid place-items-center bg-black/45 p-4">
          <form className="card w-full max-w-md p-6" onSubmit={addCategory}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Add expense category</h2>
              <button
                type="button"
                onClick={() => setAddingCategory(false)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <label>
              <span className="label">Category name</span>
              <input className="field" name="name" autoFocus required />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setAddingCategory(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Adding…" : "Add category"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function AccountsWorkspace() {
  const [data, setData] = useState(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function load() {
    try {
      setData(
        await api(
          `/api/accounts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      );
    } catch (error) {
      toast.error(error.message);
    }
  }
  useEffect(() => {
    api("/api/accounts")
      .then(setData)
      .catch((error) => toast.error(error.message));
  }, []);
  const cards = [
    {
      label: "Money in",
      value: data?.summary.totalIncome,
      color: "text-[var(--green)]",
    },
    {
      label: "Money out",
      value: data?.summary.totalExpense,
      color: "text-[var(--red)]",
    },
    {
      label: "Net balance",
      value: data?.summary.balance,
      color: "text-[var(--ink)]",
    },
  ];
  return (
    <>
      <Heading
        eyebrow="Financial ledger"
        title="Accounts"
        description="Receipts and expenses reconciled from their source transactions."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div className="card p-5" key={card.label}>
            <p className="text-sm font-bold text-(--muted)">
              {card.label}
            </p>
            <p className={`mt-2 text-2xl font-extrabold ${card.color}`}>
              {data ? money(card.value) : "—"}
            </p>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">From</span>
          <input
            className="field"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          <span className="label">To</span>
          <input
            className="field"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="btn" onClick={load}>
          Apply
        </button>
        <button
          className="btn"
          onClick={() => {
            setFrom("");
            setTo("");
            api("/api/accounts")
              .then(setData)
              .catch((error) => toast.error(error.message));
          }}
        >
          Clear
        </button>
      </div>
      {data?.movements.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Method</th>
                <th>Money in</th>
                <th>Money out</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((row) => (
                <tr key={row.id}>
                  <td>{date(row.date)}</td>
                  <td>
                    <span className="pill">{row.type}</span>
                  </td>
                  <td className="font-bold">{row.reference}</td>
                  <td>{row.description}</td>
                  <td>{row.method}</td>
                  <td className="font-extrabold text-(--green)">
                    {row.direction === "IN" ? money(row.amount) : "—"}
                  </td>
                  <td className="font-extrabold text-(--red)">
                    {row.direction === "OUT" ? money(row.amount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Landmark}
          title="No account movements"
          body="Completed sales and expenses will appear here automatically."
        />
      )}
    </>
  );
}

const permissionOptions = [
  "sales",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "expenses",
  "accounts",
  "reports",
];
export function StaffWorkspace() {
  const confirmAction = useConfirm();
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState(null),
    [saving, setSaving] = useState(false);
  async function load() {
    try {
      setRows(await api("/api/staff"));
    } catch (error) {
      toast.error(error.message);
    }
  }
  useEffect(() => {
    api("/api/staff")
      .then(setRows)
      .catch((error) => toast.error(error.message));
  }, []);
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    body.permissions = form.getAll("permissions");
    body.active = form.get("active") === "on";
    try {
      await api(editing ? `/api/staff/${editing._id}` : "/api/staff", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(
        editing ? "Staff account updated" : "Staff account created",
      );
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function deactivate(row) {
    if (!await confirmAction({ title: `Deactivate ${row.name}?`, description: "This staff member will no longer be able to sign in.", confirmText: "Deactivate", cancelText: "Cancel", variant: "warning" })) return;
    try {
      await api(`/api/staff/${row._id}`, { method: "DELETE" });
      toast.success("Staff account deactivated");
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Access control"
        title="Staff"
        description="Create employee logins, module permissions, and account status."
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={18} />
            Add staff
          </button>
        }
      />
      {rows.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.name}</strong>
                    <p className="text-xs text-(--muted)">{row.email}</p>
                  </td>
                  <td>
                    {row.permissions?.join(", ") || "No module permissions"}
                  </td>
                  <td>{row.active ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn min-h-9! p-2!"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                        aria-label="Edit staff"
                      >
                        <Edit3 size={15} />
                      </button>
                      {row.active && (
                        <button
                          className="btn btn-danger min-h-9! p-2!"
                          onClick={() => deactivate(row)}
                          aria-label="Deactivate staff"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={UserCog}
          title="No staff accounts"
          body="Create the first employee login."
        />
      )}
      {open && (
        <Modal
          title={editing ? "Edit staff" : "Add staff"}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <label>
              <span className="label">Full name</span>
              <input
                className="field"
                name="name"
                defaultValue={editing?.name}
                required
              />
            </label>
            <label>
              <span className="label">Email</span>
              <input
                className="field"
                type="email"
                name="email"
                defaultValue={editing?.email}
                required
              />
            </label>
            <label>
              <span className="label">
                {editing ? "New password (optional)" : "Password"}
              </span>
              <input
                className="field"
                name="password"
                type="password"
                minLength="8"
                required={!editing}
              />
            </label>
            <fieldset>
              <legend className="label">Module permissions</legend>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f6f1] p-4">
                {permissionOptions.map((permission) => (
                  <label
                    className="flex items-center gap-2 text-sm font-bold capitalize"
                    key={permission}
                  >
                    <input
                      type="checkbox"
                      name="permissions"
                      value={permission}
                      defaultChecked={editing?.permissions?.includes(
                        permission,
                      )}
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </fieldset>
            {editing && (
              <label className="flex items-center justify-between rounded-xl border border-[var(--line)] p-3 font-bold">
                Account active
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editing.active}
                />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save staff"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function OperationalSettings() {
  const [data, setData] = useState(null),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    api("/api/settings")
      .then(setData)
      .catch((error) => toast.error(error.message));
  }, []);
  async function save() {
    setSaving(true);
    try {
      setData(
        await api("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      );
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  if (!data)
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="loading-shimmer-icon" />
      </div>
    );
  return (
    <>
      <Heading
        eyebrow="Administration"
        title="Settings"
        description="Store, invoice, pricing, and custom mix rules used by checkout."
        action={
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <ShieldCheck size={19} />
            Store & invoice
          </h2>
          <div className="mt-5 space-y-4">
            <label>
              <span className="label">Store name</span>
              <input
                className="field"
                value={data.storeName}
                onChange={(event) =>
                  setData({ ...data, storeName: event.target.value })
                }
              />
            </label>
            <label>
              <span className="label">Invoice prefix</span>
              <input
                className="field"
                value={data.invoice.prefix}
                onChange={(event) =>
                  setData({
                    ...data,
                    invoice: { ...data.invoice, prefix: event.target.value },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Show mix ingredients on invoice
              <input
                type="checkbox"
                checked={data.invoice.showMixIngredients}
                onChange={(event) =>
                  setData({
                    ...data,
                    invoice: {
                      ...data.invoice,
                      showMixIngredients: event.target.checked,
                    },
                  })
                }
              />
            </label>
          </div>
        </section>
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <CircleDollarSign size={19} />
            Discount & rounding
          </h2>
          <div className="mt-5 space-y-4">
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Enable discounts
              <input
                type="checkbox"
                checked={data.discount.enabled}
                onChange={(event) =>
                  setData({
                    ...data,
                    discount: {
                      ...data.discount,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
            </label>
            {data.discount.enabled && (
              <label>
                <span className="label">Maximum staff discount %</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  max="100"
                  value={data.discount.maxStaffPercentage}
                  onChange={(event) =>
                    setData({
                      ...data,
                      discount: {
                        ...data.discount,
                        maxStaffPercentage: event.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Enable round off
              <input
                type="checkbox"
                checked={data.roundOff.enabled}
                onChange={(event) =>
                  setData({
                    ...data,
                    roundOff: {
                      ...data.roundOff,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
            </label>
            {data.roundOff.enabled && (
              <select
                className="field"
                value={data.roundOff.method}
                onChange={(event) =>
                  setData({
                    ...data,
                    roundOff: { ...data.roundOff, method: event.target.value },
                  })
                }
              >
                <option value="NEAREST_1">Nearest ₹1</option>
                <option value="NEAREST_050">Nearest ₹0.50</option>
              </select>
            )}
          </div>
        </section>
        <section className="card p-6 lg:col-span-2">
          <h2 className="text-lg font-extrabold">Custom mix</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Enable custom mix
              <input
                type="checkbox"
                checked={data.customMix.enabled}
                onChange={(event) =>
                  setData({
                    ...data,
                    customMix: {
                      ...data.customMix,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Packaging required
              <input
                type="checkbox"
                checked={data.customMix.bottleRequired}
                onChange={(event) =>
                  setData({
                    ...data,
                    customMix: {
                      ...data.customMix,
                      bottleRequired: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-[#f3f6f1] p-4 font-bold">
              Suggest packaging
              <input
                type="checkbox"
                checked={data.customMix.autoSuggestBottle}
                onChange={(event) =>
                  setData({
                    ...data,
                    customMix: {
                      ...data.customMix,
                      autoSuggestBottle: event.target.checked,
                    },
                  })
                }
              />
            </label>
          </div>
        </section>
      </div>
    </>
  );
}
