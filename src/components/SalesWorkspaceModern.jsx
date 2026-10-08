"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saleEditCart } from "@/lib/sale-edit";
import ExternalPurchaseModal from "@/components/ExternalPurchaseModal";
import { isExternalPurchase } from "@/lib/external-purchase";
import {checkoutFetch} from "@/lib/checkout-request";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FlaskConical,
  Minus,
  Package,
  Pause,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import ExpiredStockWarning from "@/components/ExpiredStockWarning";
import CartCustomerFields from "@/components/CartCustomerFields";
import { setCartItemWholesale } from "@/lib/wholesale";
import { saleFreeQuantity } from "@/lib/sale-free-quantity";
import { calculateSalePricing } from "@/services/pricing.service";
const money = (v) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(v || 0)),
  num = (v) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
      Number(v || 0),
    );
const api = async (u, o) => {
  const r = await checkoutFetch(u, o),
    j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j.data;
};
const sealed = (p) => Number(p.stock?.sealedPackages || 0),
  opened = (p) => Number(p.stock?.openQuantity || 0),
  stock = (p) =>
    Number(
      p.loosePricingMethod === "count_based"
        ? p.stock?.sealedPackages
        : p.stock?.totalBaseQuantity || 0,
    ),
  countBased = (p) => p.loosePricingMethod === "count_based",
  looseUnit = (p) => (countBased(p) ? p.looseUnit || "tablet" : p.baseUnit),
  plannedOpen = (p) =>
    (p.openPackageCounts || []).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    ),
  looseAvailable = (p) =>
    countBased(p)
      ? opened(p) +
        (p.looseConversionType === "fixed"
          ? sealed(p) * Number(p.unitsPerPackage || 0)
          : plannedOpen(p))
      : stock(p);
const total = (i) =>
  i.kind === "MIX"
    ? i.packageSellingPrice
    : i.saleMode === "WHOLESALE"
      ? i.wholesaleTotal
    : i.saleMode === "LOOSE"
      ? Number(i.looseQuantity) * i.loosePricePerUnit
      : i.quantity * i.packageSellingPrice;
function scrollSalesCategories(direction) {
  const strip = document.querySelector("#sales-category-filters");
  if (!strip) return;
  const categories = [...strip.children].filter(
    (category) => category instanceof HTMLElement,
  );
  if (!categories.length) return;
  const origin = categories[0].offsetLeft,
    current = strip.scrollLeft,
    firstVisible = Math.max(
      0,
      categories.findIndex(
        (category) =>
          category.offsetLeft - origin + category.offsetWidth > current + 2,
      ),
    ),
    targetIndex = Math.min(
      categories.length - 1,
      Math.max(0, firstVisible + direction * 4),
    );
  strip.scrollTo({
    left: categories[targetIndex].offsetLeft - origin,
    behavior: "smooth",
  });
}
function Badge({ children, t = "gray" }) {
  const c = {
    gray: "bg-[#eff2ee] text-[#627066]",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${c[t]}`}
    >
      {children}
    </span>
  );
}
function Step({ value, max, onChange }) {
  const [draft, setDraft] = useState(null);
  function commit() {
    if (draft === null) return;
    const quantity = Number(draft);
    setDraft(null);
    if (!Number.isInteger(quantity) || quantity < 1) return toast.error("Enter a whole quantity of at least 1.");
    if (quantity > max) return toast.error(`Only ${max} available for this sale.`);
    onChange(quantity);
  }
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--line)] bg-white">
      <button
        type="button"
        className="grid size-9 place-items-center text-[var(--green)] disabled:cursor-not-allowed disabled:text-gray-300"
        disabled={value <= 1}
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus size={14} />
      </button>
      <input type="number" inputMode="numeric" min="1" max={max} step="1"
        className="h-9 w-16 min-w-0 border-x border-[var(--line)] bg-white px-1 text-center text-sm font-bold tabular-nums"
        aria-label="Product quantity" value={draft ?? String(value)}
        onChange={event => setDraft(event.target.value)} onBlur={commit}
        onFocus={event => event.currentTarget.select()}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { setDraft(null); } }} />
      <button
        type="button"
        className="grid size-9 place-items-center text-[var(--green)] disabled:cursor-not-allowed disabled:text-gray-300"
        disabled={value >= max}
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
function LooseQuantity({ item, onChange }) {
  const [draft, setDraft] = useState(String(item.looseQuantity));
  useEffect(() => setDraft(String(item.looseQuantity)), [item.looseQuantity]);
  function commit() {
    const quantity = Number(draft),
      available = looseAvailable(item);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (countBased(item) && !Number.isInteger(quantity))
    ) {
      setDraft(String(item.looseQuantity));
      return toast.error(
        countBased(item)
          ? `${looseUnit(item)} quantity must be a whole number`
          : "Loose quantity must be greater than zero",
      );
    }
    if (quantity > available) {
      setDraft(String(item.looseQuantity));
      return toast.error(
        `Only ${num(available)} ${looseUnit(item)} is planned for this sale. Remove and add the item again to open another package.`,
      );
    }
    onChange(quantity);
  }
  return (
    <div className="inline-flex h-10 items-stretch overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <input
        className="w-20 min-w-0 px-2 text-right text-sm font-extrabold outline-none"
        type="number"
        min={countBased(item) ? 1 : 0.01}
        max={looseAvailable(item)}
        step={countBased(item) ? 1 : "any"}
        inputMode={countBased(item) ? "numeric" : "decimal"}
        aria-label={`Edit loose quantity for ${item.name}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) =>
          event.key === "Enter" && event.currentTarget.blur()
        }
        onFocus={(event) => event.currentTarget.select()}
      />
      <span className="grid min-w-10 place-items-center border-l border-[var(--line)] bg-[#f4f7f3] px-2 text-xs font-extrabold text-[var(--muted)]">
        {looseUnit(item)}
      </span>
    </div>
  );
}
function QuickSell({ p, close, add }) {
  const isCount = countBased(p),
    unit = looseUnit(p),
    canP = p.allowPackageSale && sealed(p) > 0,
    canL =
      p.allowLooseSale &&
      (isCount ? opened(p) > 0 || sealed(p) > 0 : stock(p) > 0);
  const [m, setM] = useState(canP ? "PACKAGE" : "LOOSE"),
    [q, setQ] = useState(1),
    [l, setL] = useState(""),
    [openCounts, setOpenCounts] = useState([]),
    [opening, setOpening] = useState(false),
    [countEntry, setCountEntry] = useState("");
  const requested = Number(l),
    knownAvailable = isCount
      ? p.looseConversionType === "fixed"
        ? opened(p) + sealed(p) * Number(p.unitsPerPackage || 0)
        : opened(p) + openCounts.reduce((sum, count) => sum + count, 0)
      : stock(p);
  const chips =
      unit === "ml" ? [50, 100, 200] : unit === "g" ? [25, 50, 100] : [1, 3, 6],
    bad =
      m === "LOOSE"
        ? !(requested > 0) ||
          (isCount && !Number.isInteger(requested)) ||
          (p.looseConversionType !== "count_on_open" &&
            requested > knownAvailable)
        : q > sealed(p);
  function addLine(counts = openCounts) {
    add({
      ...p,
      kind: "PRODUCT",
      saleMode: m,
      quantity: q,
      looseQuantity: requested,
      openPackageCounts: counts,
      baseUnit: unit,
    });
  }
  function continueSale() {
    if (m === "PACKAGE")
      return add({
        ...p,
        kind: "PRODUCT",
        saleMode: m,
        quantity: q,
        looseQuantity: 0,
        openPackageCounts: [],
      });
    if (
      isCount &&
      p.looseConversionType === "count_on_open" &&
      requested > knownAvailable
    ) {
      if (openCounts.length >= sealed(p))
        return toast.error(
          `No sealed ${p.packageType}s are available to open.`,
        );
      setOpening(true);
      return;
    }
    addLine();
  }
  function confirmOpen() {
    const count = Number(countEntry);
    if (!countEntry.trim())
      return toast.error(
        `Enter the number of ${unit}s in this ${p.packageType}.`,
      );
    if (!Number.isInteger(count))
      return toast.error(
        `${unit.charAt(0).toUpperCase() + unit.slice(1)} quantity must be a whole number.`,
      );
    if (count <= 0)
      return toast.error(
        `Enter the number of ${unit}s in this ${p.packageType}.`,
      );
    const next = [...openCounts, count],
      available = opened(p) + next.reduce((sum, value) => sum + value, 0);
    setOpenCounts(next);
    setCountEntry("");
    if (available >= requested) {
      setOpening(false);
      addLine(next);
    } else if (next.length >= sealed(p))
      toast.error(`No sealed ${p.packageType}s are available to open.`);
  }
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4">
      <section
        className="card max-h-[94vh] w-full max-w-lg overflow-y-auto overscroll-contain p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`Sell ${p.name}`}
      >
        <div className="flex justify-between">
          <div>
            <Badge t="green">{p.categoryId?.name}</Badge>
            <h2 className="mt-3 text-2xl font-extrabold">{p.name}</h2>
            <p className="mt-1 text-sm font-bold text-[var(--green)]">
              {p.stockLabel}
            </p>
            <ExpiredStockWarning product={p} />
          </div>
          <button onClick={close}>
            <X />
          </button>
        </div>
        {canP && canL && (
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#f1f4f0] p-1">
            <button
              className={`rounded-lg p-3 font-extrabold ${m === "PACKAGE" ? "bg-white text-[var(--green)] shadow" : "text-[var(--muted)]"}`}
              onClick={() => setM("PACKAGE")}
            >
              <Package className="mr-2 inline" size={16} />
              Full {p.packageType}
            </button>
            <button
              className={`rounded-lg p-3 font-extrabold ${m === "LOOSE" ? "bg-white text-orange-700 shadow" : "text-[var(--muted)]"}`}
              onClick={() => setM("LOOSE")}
            >
              <Sparkles className="mr-2 inline" size={16} />
              Loose
            </button>
          </div>
        )}
        <div className="mt-5 rounded-xl border p-5">
          {m === "PACKAGE" ? (
            <div className="flex justify-between">
              <span>
                <b>Package quantity</b>
                <small className="block text-[var(--muted)]">
                  {sealed(p)} available
                </small>
              </span>
              <Step value={q} max={sealed(p)} onChange={setQ} />
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-3">
                <span>
                  <b>Loose quantity</b>
                  <small className="block text-[var(--muted)]">
                    {isCount
                      ? `${num(opened(p))} ${unit}s open · ${sealed(p)} sealed ${p.packageType}${sealed(p) === 1 ? "" : "s"}`
                      : `${num(stock(p))} ${unit} available`}
                  </small>
                </span>
                <b className="shrink-0">
                  {money(p.loosePricePerUnit)} / {unit}
                </b>
              </div>
              <div className="mt-4 flex gap-2">
                {chips.map((v) => (
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${requested === v ? "border-orange-400 bg-orange-50" : ""}`}
                    key={v}
                    onClick={() => setL(String(v))}
                  >
                    {v} {unit}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex rounded-xl border">
                <input
                  autoFocus
                  className="min-w-0 flex-1 px-4 py-3 outline-none"
                  type="number"
                  min={isCount ? 1 : 0.01}
                  step={isCount ? 1 : "any"}
                  value={l}
                  onChange={(e) => setL(e.target.value)}
                  placeholder="Custom quantity"
                />
                <b className="border-l px-4 py-3">{unit}</b>
              </div>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-between">
          <span>
            <small className="block uppercase text-[var(--muted)]">
              Line total
            </small>
            <b className="text-2xl">
              {money(
                m === "LOOSE"
                  ? Number(l || 0) * p.loosePricePerUnit
                  : q * p.packageSellingPrice,
              )}
            </b>
          </span>
          <button
            disabled={bad}
            className="btn btn-primary"
            onClick={continueSale}
          >
            <ShoppingCart size={17} />
            Add to sale
          </button>
        </div>
      </section>
      {opening && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-4">
          <section
            className="card w-full max-w-md p-6"
            role="dialog"
            aria-modal="true"
          >
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              {openCounts.length
                ? "Another Jar Required"
                : `Open ${p.packageType} for loose sale`}
            </p>
            <h3 className="mt-2 text-xl font-extrabold">{p.name}</h3>
            <p className="mt-3 text-sm">
              <b>Package:</b> 1 {p.packageType} = {p.packageSize}{" "}
              {p.packageUnit || p.baseUnit}
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {openCounts.length
                ? `Only ${num(opened(p) + openCounts.reduce((sum, value) => sum + value, 0))} loose ${unit}s are currently available. ${num(requested - opened(p) - openCounts.reduce((sum, value) => sum + value, 0))} more are required.`
                : `The number of ${unit}s inside this ${p.packageType} is not predefined.`}
            </p>
            <label className="mt-5 block">
              <span className="label">
                {unit.charAt(0).toUpperCase() + unit.slice(1)} count
              </span>
              <div className="flex rounded-xl border">
                <input
                  autoFocus
                  className="min-w-0 flex-1 px-4 py-3 outline-none"
                  type="number"
                  min="1"
                  step="1"
                  value={countEntry}
                  onChange={(event) => setCountEntry(event.target.value)}
                />
                <b className="border-l px-4 py-3">{unit}s</b>
              </div>
            </label>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Sealed stock: {sealed(p) - openCounts.length} {p.packageType}
              {sealed(p) - openCounts.length === 1 ? "" : "s"}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn" onClick={() => setOpening(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmOpen}>
                Open {p.packageType}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function HeldSalesModal({ sales, onClose, onResume, onRemove }) {
  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="card max-h-[88vh] w-full max-w-2xl overflow-auto overscroll-contain p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="held-sales-title"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Open orders
            </p>
            <h2 id="held-sales-title" className="mt-1 text-2xl font-extrabold">
              Held sales
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Resume an order without losing the current sale.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close held sales">
            <X />
          </button>
        </div>
        {sales.length ? (
          <div className="mt-5 divide-y rounded-xl border">
            {sales.map((sale) => {
              const amount = sale.cart.reduce(
                (sum, item) => sum + total(item),
                0,
              );
              return (
                <article
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={sale.id}
                >
                  <div>
                    <strong>{sale.label}</strong>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {sale.cart.length}{" "}
                      {sale.cart.length === 1 ? "item" : "items"} ·{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(sale.heldAt))}
                    </p>
                    <b className="mt-2 block text-[var(--green)]">
                      {money(amount)}
                    </b>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => onRemove(sale)}>
                      <Trash2 size={16} />
                      Remove
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => onResume(sale)}
                    >
                      <ShoppingCart size={16} />
                      Resume sale
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 grid min-h-48 place-items-center rounded-xl border border-dashed text-center">
            <span>
              <Pause className="mx-auto text-[var(--green)]" />
              <strong className="mt-3 block">No held sales</strong>
              <small className="text-[var(--muted)]">
                Start another sale while a cart has items to hold it here.
              </small>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
export default function SalesWorkspaceModern({ editSaleId = null }) {
  const router = useRouter();
  const [editingSale, setEditingSale] = useState(null);
  const [editingMixIndex, setEditingMixIndex] = useState(undefined);
  const [editLoading, setEditLoading] = useState(Boolean(editSaleId));
  const [editError, setEditError] = useState("");
  const loadedEditRef = useRef(false);
  const confirmAction = useConfirm();
  const [mode, setMode] = useState("PRODUCT"),
    [products, setProducts] = useState([]),
    [categories, setCategories] = useState([]),
    [settings, setSettings] = useState(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [cart, setCart] = useState([]),
    [wholesaleDiscountEnabled, setWholesaleDiscountEnabled] = useState(false),
    [saleCustomer, setSaleCustomer] = useState(null),
    [cartCustomer, setCartCustomer] = useState({}),
    [heldSales, setHeldSales] = useState([]),
    [heldOpen, setHeldOpen] = useState(false),
    [quick, setQuick] = useState(null),
    [externalPurchase, setExternalPurchase] = useState(null),
    [mix, setMix] = useState([]),
    [mixName, setMixName] = useState(""),
    [pack, setPack] = useState("Bottle"),
    [packPrice, setPackPrice] = useState(""),
    [checkout, setCheckout] = useState(false),
    [customers, setCustomers] = useState([]),
    [customerMode, setCustomerMode] = useState("NEW"),
    [customerId, setCustomerId] = useState(""),
    [payment, setPayment] = useState("CASH"),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editSaleId) return;
    try {
      const saved = sessionStorage.getItem("oushadi-preselected-customer");
      if (saved) { const customer = JSON.parse(saved); setSaleCustomer(customer); setCartCustomer({ name: customer.name || "", phone: customer.phone || "", selected: customer }); setWholesaleDiscountEnabled(customer.customerType === "WHOLESALE"); }
    } catch {}
  }, [editSaleId]);
  useEffect(() => {
    if (!editSaleId) {
      if (loadedEditRef.current) {
        setEditingSale(null);
        setEditLoading(false);
        setEditError("");
        setCart([]);
        setCartCustomer({});
        setSaleCustomer(null);
        setWholesaleDiscountEnabled(false);
        setQuick(null);
        setMix([]);
        setEditingMixIndex(undefined);
      }
      loadedEditRef.current = false;
      return;
    }
    loadedEditRef.current = true;
    let active = true;
    setEditLoading(true);
    setEditError("");
    api(`/api/sales/${encodeURIComponent(editSaleId)}?edit=true`).then(({ sale, products: available, customer }) => {
      const billedCart = saleEditCart(sale, available);
      if (!active) return;
      setProducts(available);
      setCart(billedCart);
      setEditingSale(sale);
      setSaleCustomer(customer);
      setWholesaleDiscountEnabled(customer?.customerType === "WHOLESALE" || sale.saleType === "WHOLESALE" || sale.items.some(item => Number(item.wholesaleDiscountPercent) > 0));
      setCartCustomer({ name: sale.customerSnapshot?.name || "", phone: sale.customerSnapshot?.phone || "", selected: customer,
        doctorName: sale.customerSnapshot?.doctorName || "", ...sale.supplyContext,
        consultationFeeEnabled: Number(sale.consultationFee) > 0, consultationFee: sale.consultationFee || "" });
    }).catch(error => { if (active) { setEditError(error.message); toast.error(error.message); } })
      .finally(() => { if (active) setEditLoading(false); });
    return () => { active = false; };
  }, [editSaleId]);
  useEffect(() => {
    const customerButton = document.querySelector(".sales-cart-customer"),
      header = customerButton?.parentElement;
    if (!customerButton || !header || !saleCustomer) return;
    const clearCustomer = () => {
      setSaleCustomer(null);
      sessionStorage.removeItem("oushadi-preselected-customer");
      toast.success("Customer removed. Sale changed to walk-in.");
    };
    header.classList.add("sales-cart-has-customer");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "sales-cart-customer-remove";
    removeButton.title = "Remove customer";
    removeButton.setAttribute(
      "aria-label",
      `Remove ${saleCustomer.name} from current sale`,
    );
    removeButton.textContent = "×";
    removeButton.addEventListener("click", clearCustomer);
    header.appendChild(removeButton);
    return () => {
      removeButton.removeEventListener("click", clearCustomer);
      removeButton.remove();
      header.classList.remove("sales-cart-has-customer");
    };
  }, [saleCustomer, mode]);
  useEffect(() => {
    if (mode !== "PRODUCT") return;
    const customerButton = document.querySelector(".sales-cart-customer");
    if (!customerButton) return;
    customerButton.disabled = true;
    customerButton.tabIndex = -1;
    customerButton.title = "Customer is selected during checkout";
    customerButton.setAttribute("aria-disabled", "true");
    return () => {
      customerButton.tabIndex = 0;
      customerButton.removeAttribute("aria-disabled");
    };
  }, [mode]);
  useEffect(() => {
    if (!editSaleId) api("/api/products?sales=true")
      .then(setProducts)
      .catch((e) => toast.error(e.message));
    api("/api/categories")
      .then(setCategories)
      .catch((e) => toast.error(e.message));
    api("/api/settings")
      .then(setSettings)
      .catch(() => {});
  }, [editSaleId]);
  useEffect(() => {
    if (mode === "MIX") return;
    const strip = document.querySelector("#sales-category-filters");
    if (!strip) return;
    const leftControl = strip.nextElementSibling,
      rightControl = leftControl?.nextElementSibling;
    const update = () => {
      const atStart = strip.scrollLeft <= 2,
        atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
      leftControl?.toggleAttribute("hidden", atStart);
      rightControl?.toggleAttribute("hidden", atEnd);
    };
    update();
    strip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [mode, products.length]);
  useEffect(() => {
    if (mode !== "MIX") return;
    const heading = [...document.querySelectorAll("h2")].find(
        (node) => node.textContent?.trim() === "Build Ayurvedic mixture",
      ),
      panel = heading?.closest("aside"),
      layout = panel?.parentElement,
      workspace = layout?.parentElement,
      empty = !mix.length;
    panel?.classList.add("sales-mix-panel");
    panel?.classList.toggle("sales-mix-builder-empty", empty);
    layout?.classList.add("sales-mix-grid");
    layout?.classList.toggle("sales-mix-grid-empty", empty);
    workspace?.classList.toggle("sales-mix-workspace", !empty);
    return () => {
      panel?.classList.remove("sales-mix-panel", "sales-mix-builder-empty");
      layout?.classList.remove("sales-mix-grid", "sales-mix-grid-empty");
      workspace?.classList.remove("sales-mix-workspace");
    };
  }, [mode, mix.length]);
  useEffect(() => {
    if (mode !== "PRODUCT") return;
    const button = document.querySelector("[data-cart-payment]");
    if (!button) return;
    const panel = button.closest("aside"),
      layout = panel?.parentElement,
      workspace = layout?.parentElement,
      empty = !cart.length;
    panel?.classList.add("sales-cart-panel");
    panel?.classList.toggle("sales-cart-empty", empty);
    layout?.classList.add("sales-cart-grid");
    workspace?.classList.toggle("sales-cart-workspace", !empty);
    const openCheckout = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const fields = document.querySelectorAll("#cart-customer-fields input, #cart-customer-fields select, #cart-customer-fields textarea, [data-consultation-fee]");
      for (const field of fields) if (!field.reportValidity()) return;
      window.dispatchEvent(
        new CustomEvent("oushadi-open-checkout", {
          detail: { cart, source: "PROCEED_PAYMENT", wholesaleDiscountEnabled, cartCustomer, settings, editingSale, saleType: editingSale?.saleType },
        }),
      );
    };
    button.addEventListener("click", openCheckout, { capture: true });
    const handlePaymentShortcut = (event) => {
      if (
        event.key !== "Enter" || event.defaultPrevented || event.repeat ||
        event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
        event.shiftKey || button.disabled ||
        document.querySelector('[role="dialog"], [aria-modal="true"]') ||
        event.target?.closest?.(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="combobox"], [role="listbox"], [role="menu"]',
        )
      ) return;
      event.preventDefault();
      button.click();
    };
    window.addEventListener("keydown", handlePaymentShortcut);
    return () => {
      button.removeEventListener("click", openCheckout, { capture: true });
      window.removeEventListener("keydown", handlePaymentShortcut);
      panel?.classList.remove("sales-cart-panel", "sales-cart-empty");
      layout?.classList.remove("sales-cart-grid");
      workspace?.classList.remove("sales-cart-workspace");
    };
  }, [cart, mode, wholesaleDiscountEnabled, cartCustomer, settings, editingSale]);
  useEffect(() => {
    const completed = (event) => {
      setCartCustomer({});
      setCart([]);
      setWholesaleDiscountEnabled(false);
      setEditingSale(null);
      if (event.detail?.edited) router.replace("/sales");
      api("/api/products?sales=true")
        .then(setProducts)
        .catch(() => {});
    };
    window.addEventListener("oushadi-sale-complete", completed);
    return () => window.removeEventListener("oushadi-sale-complete", completed);
  }, [router]);
  useEffect(() => {
    const scanned = (event) => {
      const product = event.detail;
      if (!product) return;
      setMode("PRODUCT");
      setSearch("");
      if (product.allowLooseSale && (countBased(product) ? opened(product) > 0 || sealed(product) > 0 : stock(product) > 0)) {
        setQuick(product);
        return toast.info(
          `${product.name}: choose full package or loose sale.`,
        );
      }
      const available = sealed(product),
        existing = cart.find(
          (item) =>
            item.kind === "PRODUCT" &&
            !isExternalPurchase(item) &&
            ["PACKAGE", "WHOLESALE"].includes(item.saleMode) &&
            String(item.productId || item._id) === String(product._id),
        );
      if (!product.allowPackageSale || available <= 0)
        return setExternalPurchase(product);
      if (existing && Number(existing.quantity) >= available)
        return setExternalPurchase(product);
      add({
        ...product,
        kind: "PRODUCT",
        saleMode: "PACKAGE",
        quantity: 1,
        looseQuantity: 0,
        openPackageCounts: [],
        baseUnit: product.baseUnit,
      });
    };
    window.addEventListener("oushadi-barcode-product", scanned);
    return () => window.removeEventListener("oushadi-barcode-product", scanned);
  }, [cart]);
  useEffect(() => {
    if (editSaleId) return;
    const links = [...document.querySelectorAll('a[href="/sales"]')].filter(
      (link) => link.textContent?.trim().toLowerCase() === "new sale",
    );
    const start = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (cart.length)
        setHeldSales((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            label: `Sale ${current.length + 1}`,
            cart,
            wholesaleDiscountEnabled,
            heldAt: new Date().toISOString(),
          },
        ]);
      setCart([]);
      setWholesaleDiscountEnabled(false);
      setQuick(null);
      setMode("PRODUCT");
      toast.success(
        cart.length
          ? "Current sale held. New sale started."
          : "New sale ready.",
      );
    };
    links.forEach((link) =>
      link.addEventListener("click", start, { capture: true }),
    );
    return () =>
      links.forEach((link) =>
        link.removeEventListener("click", start, { capture: true }),
      );
  }, [cart, wholesaleDiscountEnabled, editSaleId]);
  const cats = useMemo(
      () => [
        ...new Set([
          ...categories.filter(category => category.active !== false).map(category => category.name),
          ...products.map((p) => p.categoryId?.name),
        ].filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b)),
      [products, categories],
    ),
    filters = [
      "All",
      ...cats,
      "Low Stock",
      "Loose Sale",
      "Opened Stock",
    ],
    shown = products.filter((p) => {
      if (mode === "MIX" && !p.allowMixture) return false;
      if (
        search &&
        !`${p.name} ${p.sku} ${p.barcode || ""} ${p.categoryId?.name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      if (mode === "MIX") return true;
      if (filter === "Low Stock") return p.lowStock;
      if (filter === "Loose Sale") return p.allowLooseSale;
      if (filter === "Opened Stock") return opened(p) > 0;
      return filter === "All" || p.categoryId?.name === filter;
    });
  const subtotal = cart.reduce((s, i) => s + total(i), 0),
    cartPricing = calculateSalePricing({
      consultationFeeEnabled: cartCustomer.consultationFeeEnabled === true,
      consultationFee: cartCustomer.consultationFee,
      wholesaleDiscount: wholesaleDiscountEnabled ? cart.map(item => item.saleWholesaleDiscountPercent || 0) : undefined,
      items: cart.map((i) => ({ ...i, discount: undefined, amount: total(i),
        gstRate: i.kind === "MIX" ? settings?.gst?.defaultRate : i.gstRate,
        useDefaultGstRate: i.kind === "MIX" ? true : i.useDefaultGstRate,
      })),
      settings,
      discount: editingSale ? { type: editingSale.discountSummary?.discountType || "FIXED", value: editingSale.discountSummary?.discountValue || 0 } : undefined,
      currentUser: { role: settings?._capabilities?.role || "STAFF" },
      placeOfSupply: cartCustomer.fulfilment === "DELIVERY"
        ? cartCustomer.deliveryStateCode || settings?.store?.stateCode
        : cartCustomer.selected && !cartCustomer.selected.gstin && (cartCustomer.selected.customerType === "WHOLESALE") === wholesaleDiscountEnabled
          ? cartCustomer.selected.stateCode || settings?.store?.stateCode
          : settings?.store?.stateCode,
    }),
    cartGst = cartPricing.gst,
    step = settings?.roundOff?.enabled,
    grand = cartPricing.total,
    ingredientsTotal = mix.reduce(
      (s, i) => s + Number(i.mixQuantity || 0) * i.loosePricePerUnit,
      0,
    ),
    mixTotal = ingredientsTotal + Number(packPrice || 0);
  useEffect(() => {
    const summary = document.querySelector(".sales-cart-summary");
    if (!summary) return;
    summary.querySelector("[data-gst-cart-summary]")?.remove();
    const roundRow = [...summary.children].find(
      (row) => row.firstElementChild?.textContent === "Round off",
    );
    if (roundRow) {
      const value = roundRow.lastElementChild;
      if (value) value.textContent = money(cartPricing.roundOff);
    }
    if (
      !settings?.gst?.enabled ||
      settings.gst.showInCart === false ||
      !cart.length
    )
      return;
    const block = document.createElement("div");
    block.dataset.gstCartSummary = "true";
    block.className =
      "mt-2 space-y-2 border-t border-dashed border-[var(--line)] pt-2 text-sm";
    const detailed =
        settings.gst.showDetailedBreakdown !== false &&
        settings.gst.displayStyle !== "COMPACT",
      rows = detailed
        ? [
            ["Taxable amount", cartGst.taxableSubtotal],
            ...(cartGst.interstate
              ? [["IGST", cartGst.igst]]
              : [
                  ["CGST", cartGst.cgst],
                  ["SGST", cartGst.sgst],
                ]),
          ]
        : [["GST", cartGst.tax]];
    for (const [label, value] of rows) {
      const row = document.createElement("div"),
        name = document.createElement("span"),
        price = document.createElement("b");
      row.className = "flex justify-between";
      name.textContent = label;
      price.className = "tabular-nums";
      price.textContent = money(value);
      row.append(name, price);
      block.append(row);
    }
    summary.firstElementChild?.after(block);
    return () => block.remove();
  }, [
    cart.length,
    cartGst.cgst,
    cartGst.igst,
    cartGst.interstate,
    cartGst.sgst,
    cartGst.tax,
    cartGst.taxableSubtotal,
    cartGst.total,
    grand,
    cartPricing.roundOff,
    settings,
  ]);
  function startNewSale() {
    if (editingSale) return;
    if (cart.length)
      setHeldSales((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          label: `Sale ${current.length + 1}`,
          cart,
          wholesaleDiscountEnabled,
          customer: saleCustomer,
          cartCustomer,
          heldAt: new Date().toISOString(),
        },
      ]);
    setCart([]);
    setWholesaleDiscountEnabled(false);
    setSaleCustomer(null);
    setCartCustomer({});
    sessionStorage.removeItem("oushadi-preselected-customer");
    setQuick(null);
    setMode("PRODUCT");
    toast.success(
      cart.length ? "Current sale held. New sale started." : "New sale ready.",
    );
  }
  function resumeHeldSale(sale) {
    setHeldSales((current) => {
      const remaining = current.filter((item) => item.id !== sale.id);
      return cart.length
        ? [
            ...remaining,
            {
              id: crypto.randomUUID(),
              label: `Sale ${remaining.length + 1}`,
              cart,
              wholesaleDiscountEnabled,
              customer: saleCustomer,
              cartCustomer,
              heldAt: new Date().toISOString(),
            },
          ]
        : remaining;
    });
    setCart(sale.cart.map((item) => ({ ...item, discount: undefined })));
    setWholesaleDiscountEnabled(Boolean(sale.wholesaleDiscountEnabled));
    setSaleCustomer(sale.customer || null);
    setCartCustomer(sale.cartCustomer || { name: sale.customer?.name || "", phone: sale.customer?.phone || "", selected: sale.customer || null });
    if (sale.customer)
      sessionStorage.setItem(
        "oushadi-preselected-customer",
        JSON.stringify(sale.customer),
      );
    else sessionStorage.removeItem("oushadi-preselected-customer");
    setMode("PRODUCT");
    setHeldOpen(false);
    toast.success(`${sale.label} resumed`);
  }
  function removeHeldSale(sale) {
    setHeldSales((current) => current.filter((item) => item.id !== sale.id));
    toast.success(`${sale.label} removed`);
  }
  function selectProduct(product) {
    const canSellLoose = product.allowLooseSale &&
      (countBased(product) ? opened(product) > 0 || sealed(product) > 0 : stock(product) > 0);
    if (canSellLoose) return setQuick(product);
    const available = sealed(product);
    const existing = cart.find((item) => item.kind === "PRODUCT" &&
      !isExternalPurchase(item) &&
      ["PACKAGE", "WHOLESALE"].includes(item.saleMode) &&
      String(item.productId || item._id) === String(product._id));
    if (!product.allowPackageSale || available <= 0)
      return setExternalPurchase(product);
    if (existing && Number(existing.quantity) >= available)
      return setExternalPurchase(product);
    add({ ...product, kind: "PRODUCT", saleMode: "PACKAGE", quantity: 1,
      looseQuantity: 0, openPackageCounts: [], baseUnit: product.baseUnit });
  }
  function updateCartItem(item, enabled, quantity = item.quantity) {
    try {
      if (isExternalPurchase(item)) {
        if (!(Number(quantity) > 0)) throw new Error("Quantity must be greater than zero.");
        setCart(current => current.map(line => line._id === item._id ? { ...line, quantity: Number(quantity), total: Number(quantity) * line.unitPrice, totalPurchaseCost: Number(quantity) * line.purchaseCost } : line));
        return;
      }
      if (!enabled && quantity + Number(item.freeQuantity || 0) > sealed(item))
        throw new Error(`Insufficient sealed stock for ${item.name} including free quantity`);
      const updated = item.saleMode === "WHOLESALE" && item.sellBy === "LOOSE"
        ? { ...item, quantity, wholesaleTotal: Number(item.wholesalePriceApplied) * quantity }
        : setCartItemWholesale(item, enabled, quantity);
      setCart((current) => current.map((x) => x._id === item._id ? updated : x));
    } catch (error) { toast.error(error.message); }
  }
  function updateFreeQuantity(item, value) {
    try {
      const free = saleFreeQuantity(value, { wholesale: wholesaleDiscountEnabled, saleMode: item.saleMode, countBased: countBased(item), role: settings?._capabilities?.role });
      if (item.saleMode === "PACKAGE" && Number(item.quantity) + free > sealed(item))
        throw new Error(`Insufficient sealed stock for ${item.name} including free quantity`);
      setCart(current => current.map(row => row._id === item._id ? { ...row, freeQuantity: value === "" ? "" : free } : row));
    } catch (error) { toast.error(error.message); }
  }
  function add(i) {
    if (editingSale?.saleType === "WHOLESALE" && i.kind === "PRODUCT" && i.saleMode === "PACKAGE") {
      try { i = setCartItemWholesale(i, true, i.quantity); }
      catch (error) { return toast.error(error.message); }
    }
    if (editingSale?.saleType === "WHOLESALE" && i.saleMode === "LOOSE") return toast.error("Add wholesale packages when editing this sale.");
    const wholesaleItem = cart.find((x) => x._id === i._id && x.saleMode === "WHOLESALE");
    if (wholesaleItem) {
      updateCartItem(wholesaleItem, true, wholesaleItem.quantity + i.quantity);
      setQuick(null);
      return;
    }
    setCart((c) =>
      i.saleMode === "PACKAGE" && c.some((x) => x._id === i._id)
        ? c.map((x) =>
            x._id === i._id
              ? { ...x, quantity: Math.min(sealed(x) - Number(x.freeQuantity || 0), x.quantity + i.quantity) }
              : x,
          )
        : [
            ...c,
            {
              ...i,
              productId: i.productId || i._id,
              _id:
                i.saleMode === "PACKAGE"
                  ? i._id
                  : `${i._id}-${crypto.randomUUID()}`,
            },
          ],
    );
    setQuick(null);
    toast.success(`${i.name} added`);
  }
  function editMix(item) {
    setMix(item.ingredients.map(ingredient => ({ ...ingredient, mixQuantity: ingredient.baseQuantity })));
    setMixName(item.name);
    setPack(item.packageType);
    setPackPrice(item.packagingPrice || "");
    setEditingMixIndex(item.billedLineIndex);
    setCart(current => current.filter(line => line._id !== item._id));
    setMode("MIX");
  }
  function ingredient(p) {
    if (mix.some((i) => i._id === p._id)) return;
    if (mix.length && mix[0].baseUnit !== p.baseUnit)
      return toast.error(
        `Only ${mix[0].baseUnit} ingredients can be mixed together`,
      );
    setMix((c) => [...c, { ...p, mixQuantity: "" }]);
  }
  function saveMix(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!mix.length) return toast.error("Please add at least one ingredient");
    if (
      mix.some(
        (i) => !(Number(i.mixQuantity) > 0) || Number(i.mixQuantity) > stock(i),
      )
    )
      return toast.error("Enter ingredient quantities within available stock");
    const savedMix = {
      _id: `mix-${crypto.randomUUID()}`,
      kind: "MIX",
      billedLineIndex: editingMixIndex,
      saleMode: "MIX",
      quantity: 1,
      name: mixName || "Custom Mix",
      packageType: pack,
      packagingPrice: Number(packPrice || 0),
      packageSellingPrice: mixTotal,
      ingredients: mix.map((i) => ({
        ...i,
        baseQuantity: Number(i.mixQuantity),
      })),
    };
    setCart((current) => [...current, savedMix]);
    setMix([]);
    setEditingMixIndex(undefined);
    setMixName("");
    setPackPrice("");
    setMode("PRODUCT");
    toast.success("Custom mix added to the Product Sale cart");
  }
  async function pay() {
    setCheckout(true);
    try {
      setCustomers(await api("/api/customers"));
    } catch (e) {
      toast.error(e.message);
    }
  }
  async function complete(e) {
    e.preventDefault();
    if (customerMode === "EXISTING" && !customerId)
      return toast.error("Select a customer");
    const f = Object.fromEntries(new FormData(e.currentTarget)),
      items = cart.map((i) =>
        isExternalPurchase(i) ? { ...i, unitPrice: i.packageSellingPrice, productId: i.productId || null } : i.kind === "MIX"
          ? {
              kind: "MIX",
              name: i.name,
              packageType: i.packageType,
              packagingPrice: i.packagingPrice,
              ingredients: i.ingredients.map((x) => ({
                productId: x._id,
                baseQuantity: x.baseQuantity,
              })),
            }
          : {
              kind: "PRODUCT",
              productId: i.productId || String(i._id).split("-")[0],
              saleMode: i.saleMode,
              quantity: i.quantity,
              baseQuantity: i.looseQuantity,
              freeQuantity: wholesaleDiscountEnabled ? i.freeQuantity || 0 : 0,
              saleWholesaleDiscountPercent: wholesaleDiscountEnabled ? i.saleWholesaleDiscountPercent || 0 : 0,
            },
      );
    setSaving(true);
    try {
      const sale = await api("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          wholesaleDiscountEnabled,
          customerId: customerMode === "EXISTING" ? customerId : undefined,
          customer:
            customerMode === "NEW"
              ? {
                  name: f.customerName,
                  phone: f.phone,
                  email: f.email,
                  address: f.address,
                }
              : undefined,
          paymentMethod: payment,
        }),
      });
      toast.success(`Sale ${sale.invoiceNumber} completed`);
      setCart([]);
      setWholesaleDiscountEnabled(false);
      setCheckout(false);
      setProducts(await api("/api/products?sales=true"));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  if (editLoading) return <div className="card p-8" role="status">Loading billed products for editing…</div>;
  if (editError) return <div className="card p-8"><h1 className="text-xl font-extrabold">Unable to edit sale</h1><p className="mt-2">{editError}</p><Link href={`/sales/${editSaleId}`} className="btn mt-4">Back to sale</Link></div>;
  return (
    <div>
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[var(--green)]">
            Cashier workspace
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Sales</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Package sales, loose quantities, and custom Ayurvedic mixtures.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" disabled={Boolean(editingSale)} onClick={() => setHeldOpen(true)}>
            <Pause size={16} />
            Held sales{heldSales.length ? ` (${heldSales.length})` : ""}
          </button>
          <Link href="/sales/recent" className="btn">
            <Clock3 size={16} />
            Recent sales
          </Link>
          <button
            className="btn"
            onClick={() => document.querySelector("#pos-search")?.focus()}
          >
            <Barcode size={17} />
            Scan barcode
          </button>
          <button className="btn btn-primary" disabled={Boolean(editingSale)} onClick={startNewSale}>
            <Plus size={17} />
            New sale
          </button>
        </div>
      </header>
      {editingSale && <section className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-[var(--green)] p-4">
        <div><h2 className="font-extrabold">Editing {editingSale.invoiceNumber}</h2><p className="mt-1 text-sm text-[var(--muted)]">Billed items are loaded below. Change quantities, remove items, or add more products. Changes apply when you save.</p></div>
        <Link href={`/sales/${editingSale._id}`} className="btn">Cancel edit</Link>
      </section>}
      {heldOpen && (
        <HeldSalesModal
          sales={heldSales}
          onClose={() => setHeldOpen(false)}
          onResume={resumeHeldSale}
          onRemove={removeHeldSale}
        />
      )}
      <section className="mb-4 flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm xl:flex-row">
        <div className="inline-flex rounded-xl bg-[#eff3ef] p-1">
          <button
            className={`rounded-lg px-4 py-2.5 font-extrabold ${mode === "PRODUCT" ? "bg-[var(--green)] text-white" : "text-[var(--muted)]"}`}
            onClick={() => setMode("PRODUCT")}
          >
            <ShoppingBag className="mr-2 inline" size={16} />
            Sale
          </button>
          <button
            className={`rounded-lg px-4 py-2.5 font-extrabold ${mode === "MIX" ? "bg-[var(--green)] text-white" : "text-[var(--muted)]"}`}
            onClick={() => setMode("MIX")}
          >
            <FlaskConical className="mr-2 inline" size={16} />
            Custom Mix
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3" size={18} />
          <input
            id="pos-search"
            className="field !min-h-11 !pl-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product name, SKU, category, or scan barcode"
          />
        </div>
        <button className="btn" type="button" onClick={() => setExternalPurchase({})}><Plus size={16} />External Purchase</button>
      </section>
      {mode !== "MIX" && (
        <div className="relative mb-4">
          <div
            id="sales-category-filters"
            className="flex gap-2 overflow-auto px-12"
          >
            {filters.map((f) => (
              <button
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-extrabold ${filter === f ? "bg-[var(--green)] text-white" : "bg-white"}`}
                key={f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-[var(--paper)] via-[var(--paper)] to-transparent pr-5">
            <button
              type="button"
              className="pointer-events-auto grid size-9 place-items-center rounded-full border border-[var(--green)] bg-white text-[var(--green)] shadow-md transition hover:bg-[var(--green-soft)]"
              aria-label="Show previous category filters"
              onClick={() => scrollSalesCategories(-1)}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-[var(--paper)] via-[var(--paper)] to-transparent pl-5">
            <button
              type="button"
              className="pointer-events-auto grid size-9 place-items-center rounded-full border border-[var(--green)] bg-[var(--green)] text-white shadow-md transition hover:bg-[var(--green-dark)]"
              aria-label="Show next category filters"
              onClick={() => scrollSalesCategories(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
      {mode !== "WHOLESALE" && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(mode === "PRODUCT"
            ? [
                ["Products shown", shown.length],
                ["Loose sale", shown.filter((p) => p.allowLooseSale).length],
                ["Opened stock", shown.filter((p) => opened(p) > 0).length],
                [
                  "Low stock",
                  shown.filter(
                    (p) => p.reorderLevel > 0 && stock(p) <= p.reorderLevel,
                  ).length,
                ],
              ]
            : [
                ["Compatible products", shown.length],
                ["Ingredients", mix.length],
                [
                  "Total quantity",
                  `${num(mix.reduce((s, i) => s + Number(i.mixQuantity || 0), 0))} ${mix[0]?.baseUnit || "units"}`,
                ],
                ["Estimated total", money(mixTotal)],
              ]
          ).map(([l, v]) => (
            <div className="rounded-xl border bg-white p-3" key={l}>
              <small className="uppercase text-[var(--muted)]">{l}</small>
              <b className="mt-1 block">{v}</b>
            </div>
          ))}
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <main className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => (
            <article
              className={`sales-product-card card flex cursor-pointer flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md ${p.expired ? "sales-product-expired" : ""}`}
              key={p._id}
              onClick={() => (mode === "PRODUCT" ? selectProduct(p) : ingredient(p))}
            >
              <div className="flex justify-between">
                <Badge t="green">{p.categoryId?.name}</Badge>
                <span className="grid size-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
                  <Plus size={17} />
                </span>
              </div>
              <h2 className="mt-4 text-lg font-extrabold">{p.name}</h2>
              {mode === "PRODUCT" && <button type="button" className="btn mt-2 !min-h-8 text-xs" onClick={event => { event.stopPropagation(); setExternalPurchase(p); }}>Buy Externally &amp; Add</button>}
              <ExpiredStockWarning product={p} />
              <small className="text-[var(--muted)]">SKU {p.sku}</small>
              <div className="sales-product-badges mt-3 flex flex-wrap gap-1">
                {opened(p) > 0 && (
                  <Badge t="orange">
                    {num(opened(p))} {looseUnit(p)} open
                  </Badge>
                )}
                {p.lowStock && <Badge t="red">Low stock</Badge>}
                {p.allowLooseSale && <Badge t="blue">Loose sale</Badge>}
                {countBased(p) && <Badge t="orange">Count based</Badge>}
                {p.allowMixture && <Badge t="green">Mix enabled</Badge>}
              </div>
              <div className="pt-2">
                <b className="text-sm text-[var(--green)]">{p.stockLabel}</b>
                {mode === "PRODUCT" && p.allowPackageSale && (
                  <p className="mt-2 text-xl font-extrabold">
                    {money(p.packageSellingPrice)}{" "}
                    <small>/ {p.packageType}</small>
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {mode === "MIX" ? "Mix ingredient" : "Loose sale available"} ·{" "}
                  {money(p.loosePricePerUnit)} / {looseUnit(p)}
                </p>
              </div>
            </article>
          ))}
        </main>
        {mode === "PRODUCT" ? (
          <aside className="sales-cart-shell card overflow-hidden xl:sticky xl:top-24">
            <div className="sales-cart-header border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <small className="block uppercase tracking-wide text-[var(--green)]">
                    Current Sale
                  </small>
                  <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold">
                    <ShoppingCart size={18} />
                    {cart.length} {cart.length === 1 ? "item" : "items"}
                  </h2>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="sales-cart-clear"
                    onClick={async () =>
                      (await confirmAction({
                        title: "Clear current sale?",
                        description: `This will remove all ${cart.length} items from the current sale.`,
                        confirmText: "Clear all",
                        cancelText: "Cancel",
                        variant: "warning",
                      })) && (setCart([]), setCartCustomer({}), setWholesaleDiscountEnabled(false))
                    }
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <div className="sales-cart-list">
              <CartCustomerFields value={cartCustomer} onChange={setCartCustomer} wholesale={wholesaleDiscountEnabled} />
              {cart.length ? (
                [...cart].reverse().map((i) => {
                  const saleLabel =
                      isExternalPurchase(i) ? "External Purchase" : i.kind === "MIX"
                        ? "Composite Sale"
                        : i.saleMode === "LOOSE"
                          ? "Loose Sale"
                          : i.saleMode === "WHOLESALE" ? "Wholesale" : "Package Sale",
                    quantityLabel =
                      i.kind === "MIX"
                        ? `1 ${i.packageType}`
                        : i.saleMode === "LOOSE"
                          ? `${num(i.looseQuantity)} ${i.baseUnit}`
                          : `${i.quantity} ${i.packageType}`,
                    calculation =
                      i.kind === "MIX"
                        ? `${i.ingredients.length} ingredients`
                        : i.saleMode === "LOOSE"
                          ? `${money(i.loosePricePerUnit)} per ${i.baseUnit}`
                          : `${money(i.saleMode === "WHOLESALE" ? i.wholesalePriceApplied : i.packageSellingPrice)} × ${i.quantity}`;
                  return (
                    <article className="sales-cart-item" key={i._id}>
                      <div className="sales-cart-thumb" aria-hidden="true">
                        {i.name?.trim()?.charAt(0)?.toUpperCase() || (
                          <Package size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <b className="sales-cart-name">{i.name}</b>
                          <button
                            type="button"
                            className="sales-cart-delete"
                            title={`Remove ${i.name}`}
                            aria-label={`Remove ${i.name} from cart`}
                            onClick={() =>
                              setCart((c) => c.filter((x) => x._id !== i._id))
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {editingSale && i.kind === "MIX" && <button type="button" className="btn mt-2" onClick={() => editMix(i)}>Edit mixture</button>}
                        {isExternalPurchase(i) ? <div className="mt-2 text-xs text-[var(--muted)]">Cost {money(i.purchaseCost)} / {i.packageType} · Total cost {money(i.quantity * i.purchaseCost)}<button className="btn ml-2 !min-h-7 !px-2 text-xs" type="button" onClick={() => setExternalPurchase(i)}>Edit details</button></div> : <ExpiredStockWarning product={i} />}
                        {wholesaleDiscountEnabled && i.kind === "PRODUCT" && i.saleMode !== "WHOLESALE" && (
                          <label className="my-2 flex items-center justify-between gap-2 text-xs">
                            <span>Wholesale discount %</span>
                            <input type="number" className="field !min-h-8 !w-20" min="0" max="100" step="0.01"
                              aria-label={`Wholesale discount percentage for ${i.name}`} placeholder="0" value={i.saleWholesaleDiscountPercent ?? ""}
                              onChange={event => { const value = event.target.value; setCart(current => current.map(item => item._id === i._id ? { ...item, saleWholesaleDiscountPercent: value } : item)); }} />
                          </label>
                        )}
                        {wholesaleDiscountEnabled && !isExternalPurchase(i) && i.kind === "PRODUCT" && ["PACKAGE", "LOOSE"].includes(i.saleMode) && (
                          <label className="my-2 flex items-center justify-between gap-2 text-xs">
                            <span>Free quantity ({i.saleMode === "LOOSE" ? i.looseUnit || i.baseUnit : i.packageType})</span>
                            <input type="number" className="field !min-h-8 !w-20" min="0" step={i.saleMode === "PACKAGE" || countBased(i) ? "1" : "0.001"}
                              aria-label={`Free quantity for ${i.name}`} placeholder="0" value={i.freeQuantity ?? ""}
                              disabled={settings?._capabilities?.role !== "ADMIN"} title={settings?._capabilities?.role !== "ADMIN" ? "Only an administrator can change wholesale free quantity" : undefined}
                              onChange={event => updateFreeQuantity(i, event.target.value)} />
                          </label>
                        )}
                        <div className="sales-cart-meta">
                          <Badge
                            t={
                              i.kind === "MIX"
                                ? "orange"
                                : i.saleMode === "LOOSE"
                                  ? "blue"
                                  : "green"
                            }
                          >
                            {saleLabel}
                          </Badge>
                          <span>{quantityLabel}</span>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          {isExternalPurchase(i) ? <input type="number" className="field !min-h-8 !w-24" aria-label={`Quantity for ${i.name}`} min="0.001" max="99999999" step="0.001" value={i.quantity} onChange={event => updateCartItem(i, false, event.target.value)} /> : i.kind !== "MIX" && ["PACKAGE", "WHOLESALE"].includes(i.saleMode) ? (
                            <Step
                              value={i.quantity}
                              max={i.saleMode === "WHOLESALE" && i.sellBy === "LOOSE" ? looseAvailable(i) : sealed(i) - (i.saleMode === "PACKAGE" ? Number(i.freeQuantity || 0) : 0)}
                              onChange={(quantity) => updateCartItem(i, i.saleMode === "WHOLESALE", quantity)}
                            />
                          ) : i.kind !== "MIX" && i.saleMode === "LOOSE" ? (
                            <LooseQuantity
                              item={i}
                              onChange={(looseQuantity) =>
                                setCart((c) =>
                                  c.map((x) =>
                                    x._id === i._id
                                      ? { ...x, looseQuantity }
                                      : x,
                                  ),
                                )
                              }
                            />
                          ) : (
                            <span className="text-xs font-bold text-[var(--muted)]">
                              Ready
                            </span>
                          )}
                          <span className="min-w-0 text-right">
                            <b className="block tabular-nums">
                              {money(wholesaleDiscountEnabled ? cartPricing.gst.lines[cart.indexOf(i)]?.total ?? total(i) : total(i))}
                            </b>
                            <small className="block truncate text-[10px] text-[var(--muted)]">
                              {calculation}
                            </small>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="sales-cart-empty-state">
                  <span className="grid size-11 place-items-center rounded-full bg-[var(--green-soft)] text-[var(--green)]">
                    <ShoppingCart size={20} />
                  </span>
                  <b>Your cart is empty.</b>
                  <small>Select a product to start a sale.</small>
                </div>
              )}
            </div>
            <div className="sales-cart-summary border-t">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="size-4 accent-[var(--green)]" checked={Boolean(cartCustomer.consultationFeeEnabled)} onChange={(event) => setCartCustomer((current) => ({ ...current, consultationFeeEnabled: event.target.checked, consultationFee: "" }))} />Consultation Fee</label>
                {cartCustomer.consultationFeeEnabled && <input data-consultation-fee type="number" className="field !min-h-9 !w-28" aria-label="Consultation fee amount" placeholder="Enter amount" min="0.01" max="99999999" step="0.01" required value={cartCustomer.consultationFee || ""} onChange={(event) => setCartCustomer((current) => ({ ...current, consultationFee: event.target.value }))} />}
              </div>
              {cartPricing.consultationFee > 0 && <div className="mb-2 flex justify-between text-sm"><span>Consultation fee</span><b>{money(cartPricing.consultationFee)}</b></div>}
              <label className="mb-3 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" className="size-4 accent-[var(--green)]"
                  checked={wholesaleDiscountEnabled}
                  onChange={(e) => { setWholesaleDiscountEnabled(e.target.checked); if (!e.target.checked) { setCart(current => current.map(item => item.saleMode === "WHOLESALE" ? item : { ...item, freeQuantity: 0, saleWholesaleDiscountPercent: "" })); } }} />
                Wholesale
              </label>

              {cartPricing.totalDiscount > 0 && <div className="flex justify-between text-sm"><span>Discount</span><b>-{money(cartPricing.totalDiscount)}</b></div>}
              <div className="flex justify-between">
                <span>Subtotal</span>
                <b className="tabular-nums">{money(subtotal)}</b>
              </div>
              {settings?.roundOff?.enabled && (
                <div className="mt-2 flex justify-between">
                  <span>Round off</span>
                  <b className="tabular-nums">{money(cartPricing.roundOff)}</b>
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t-2 border-[var(--ink)] pt-3">
                <b className="text-lg">Grand total</b>
                <b className="text-2xl tabular-nums">{money(grand)}</b>
              </div>
              <button
                data-cart-payment
                aria-keyshortcuts="Enter"
                title="Press Enter outside input fields to proceed to payment"
                disabled={!cart.length}
                className="btn btn-primary mt-4 w-full"
                onClick={() =>
                  document.querySelector('[href="/sales/new"]')?.click()
                }
              >
                <WalletCards size={17} />
                {editingSale ? "Review & Save changes" : "Proceed to Payment"} <span aria-hidden="true">•</span>{" "}
                {money(grand)}
              </button>
            </div>
          </aside>
        ) : (
          <aside className="card overflow-hidden xl:sticky xl:top-24">
            <div className="border-b p-5">
              <small className="uppercase text-[var(--green)]">
                Custom mix builder
              </small>
              <h2 className="mt-1 text-xl font-extrabold">
                Build Ayurvedic mixture
              </h2>
            </div>
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-auto p-5 [&>*]:shrink-0">
              <label className="block">
                <span className="label">Mix label (optional)</span>
                <input
                  className="field"
                  value={mixName}
                  onChange={(e) => setMixName(e.target.value)}
                  placeholder="Cough Mixture"
                />
              </label>
              {[...mix].reverse().map((i) => (
                <div className="rounded-xl border p-3" key={i._id}>
                  <div className="flex justify-between">
                    <span>
                      <b>{i.name}</b>
                      <small className="block text-[var(--muted)]">
                        {money(i.loosePricePerUnit)} / {i.baseUnit}
                      </small>
                    </span>
                    <button
                      onClick={() =>
                        setMix((c) => c.filter((x) => x._id !== i._id))
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="field !min-h-9"
                      type="number"
                      value={i.mixQuantity}
                      onChange={(e) =>
                        setMix((c) =>
                          c.map((x) =>
                            x._id === i._id
                              ? { ...x, mixQuantity: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Quantity"
                    />
                    <b className="py-2">{i.baseUnit}</b>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#f4f7f3] p-4">
                <label>
                  <span className="label">Package type</span>
                  <select
                    className="field"
                    value={pack}
                    onChange={(e) => setPack(e.target.value)}
                  >
                    <option>Bottle</option>
                    <option>Packet</option>
                    <option>Jar</option>
                  </select>
                </label>
                <label>
                  <span className="label">Charge</span>
                  <input
                    className="field"
                    type="number"
                    value={packPrice}
                    onChange={(e) => setPackPrice(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="border-t p-5">
              <div className="flex justify-between">
                <span>Ingredients</span>
                <b>{money(ingredientsTotal)}</b>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Packaging</span>
                <b>{money(packPrice)}</b>
              </div>
              <div className="mt-3 flex justify-between border-t border-dashed pt-3 text-xl">
                <b>Mix total</b>
                <b>{money(mixTotal)}</b>
              </div>
              <button className="btn btn-primary mt-4 w-full" onClick={saveMix}>
                <FlaskConical size={17} />
                Add mix to cart
              </button>
            </div>
          </aside>
        )}
      </div>
      {quick && <QuickSell p={quick} close={() => setQuick(null)} add={add} />}
      {externalPurchase && <ExternalPurchaseModal key={externalPurchase._id || "new-external"} products={products} initial={externalPurchase} onClose={() => setExternalPurchase(null)} onSave={line => setCart(current => {
        const existing = current.find(item => item._id === line._id && isExternalPurchase(item));
        return existing ? current.map(item => item._id === line._id ? line : item) : [...current, line];
      })} />}
    </div>
  );
}
