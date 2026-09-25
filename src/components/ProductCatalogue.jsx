"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Papa from "papaparse";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  Layers3,
  LoaderCircle,
  MoreVertical,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import {
  BASE_UNITS,
  LOOSE_CONVERSION_TYPES,
  LOOSE_PRICING_METHODS,
  LOOSE_UNITS,
  PACKAGE_TYPES,
  calculateLooseUnitPrice,
  parseBoolean,
} from "@/lib/product-validation";
import { calculateLineGST } from "@/services/gst.service";
import BarcodeInput from "@/components/barcode/BarcodeInput";
import { detectBarcodeType } from "@/lib/barcode";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const number = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
    Number(value || 0),
  );
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";
const plural = (word, count) =>
  count === 1
    ? word
    : word === "Box"
      ? "Boxes"
      : word === "Piece"
        ? "Pieces"
        : `${word}s`;

async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return result.data;
}

function Modal({ children, onClose, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-3 sm:p-5"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`card relative max-h-[94dvh] w-full ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto p-5 sm:p-7`}
      >
        {children}
      </section>
    </div>
  );
}

function Drawer({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[75] bg-black/35"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
        {children}
      </aside>
    </div>
  );
}

function Pill({ children, tone = "green" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    gray: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-extrabold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  subtitle,
  children,
  sectionRef,
  hidden = false,
}) {
  if (hidden) return null;
  return (
    <section
      ref={sectionRef}
      className="scroll-mt-24 rounded-2xl border border-[var(--line)] p-4 sm:p-5"
    >
      <div className="mb-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function ToggleCard({ name, checked, onChange, title, help, children }) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-4 ${checked ? "border-emerald-300 bg-emerald-50/60" : "border-[var(--line)]"}`}
    >
      <span>
        <strong className="flex items-center gap-1.5 text-sm">
          {title}
          {help && <FieldLabel help={help} />}
        </strong>
        <small className="mt-1 block leading-5 text-[var(--muted)]">
          {children}
        </small>
      </span>
      <input
        className="mt-1 size-4 accent-[var(--green)]"
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function FieldLabel({ children, help }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const anchorRef = useRef(null);
  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(288, window.innerWidth - 32);
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: rect.top > 150 ? rect.top - 8 : rect.bottom + 8,
      width,
      above: rect.top > 150,
    });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event) => {
      if (!anchorRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  return (
    <span className="label flex items-center gap-1.5">
      {children}
      {help && (
        <span ref={anchorRef} className="inline-flex">
          <button
            type="button"
            className="inline-flex rounded-full text-emerald-700/65 transition hover:text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
            aria-label={`More information about ${typeof children === "string" ? children.replace(/\s*\*$/, "") : "this field"}`}
            aria-expanded={open}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (open) setOpen(false);
              else show();
            }}
            onMouseEnter={show}
            onMouseLeave={() => setOpen(false)}
          >
            <Info size={15} aria-hidden="true" />
          </button>
          {open &&
            position &&
            createPortal(
              <span
                role="tooltip"
                className="fixed z-[200] rounded-lg border border-emerald-100 bg-white p-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-slate-700 shadow-xl"
                style={{
                  left: position.left,
                  top: position.top,
                  width: position.width,
                  transform: position.above ? "translateY(-100%)" : undefined,
                }}
              >
                {help}
              </span>,
              document.body,
            )}
        </span>
      )}
    </span>
  );
}

function CategoryModal({ onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!String(values.name || "").trim())
      return toast.error("Category name is required");
    setSaving(true);
    try {
      const category = await api("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      toast.success("Category created successfully.");
      onCreated(category);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Product category
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">Add category</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-6 grid gap-4">
          <label>
            <span className="label">Category name *</span>
            <input autoFocus className="field" name="name" />
          </label>
          <label>
            <span className="label">Description</span>
            <textarea className="field min-h-24" name="description" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const initialProduct = {
  name: "",
  sku: "",
  barcode: "",
  barcodeType: "EAN13",
  manufacturer: "",
  hsnCode: "",
  taxable: true,
  useDefaultGstRate: true,
  gstRate: "",
  gstPriceMode: "STORE",
  categoryId: "",
  baseUnit: "ml",
  packageUnit: "ml",
  packageType: "Bottle",
  packageSize: "",
  stockPackType: "Box",
  unitsPerStockPack: 1,
  packageSellingPrice: "",
  loosePricingMethod: "PROPORTIONAL",
  loosePricePerUnit: "",
  looseUnit: "tablet",
  looseConversionType: LOOSE_CONVERSION_TYPES.COUNT_ON_OPEN,
  unitsPerPackage: "",
  priceTiers: [],
  wholesaleEnabled: false,
  wholesalePrice: "",
  wholesaleMinQty: 1,
  wholesaleUnit: "Box",
  unitsPerWholesalePack: 1,
  wholesalePriceTiers: [],
  allowWholesaleLooseSale: false,
  freeSchemeEnabled: false,
  freeSchemeType: "SAME_PRODUCT",
  freeSchemeBuyQty: 1,
  freeSchemeFreeQty: 1,
  freeSchemeFreeProduct: "",
  reorderLevel: "",
  openingPackages: "",
  openingStockPacks: "",
  openingQuantity: "",
  batchNumber: "",
  manufacturingDate: "",
  expiryDate: "",
  purchasePrice: "",
  supplierId: "",
  allowPackageSale: true,
  allowLooseSale: false,
  allowMixture: false,
  visibleInSales: true,
  active: true,
  batchTracking: false,
};

function ProductEditor({
  product,
  mode,
  products,
  categories,
  suppliers,
  settings,
  onCategory,
  onClose,
  onSaved,
}) {
  const edit = Boolean(product?._id);
  const [form, setForm] = useState(() =>
    product
      ? {
          ...initialProduct,
          ...product,
          barcodeType: product.barcodeType || detectBarcodeType(product.barcode),
          categoryId: product.categoryId?._id || product.categoryId || "",
          priceTiers: product.priceTiers || [],
          batchTracking: Boolean(product.batchTracking),
          visibleInSales: product.visibleInSales !== false,
          active: product.active !== false,
        }
      : initialProduct,
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const focusedTitle = {
    sale: "Edit Product Sale",
    pricing: "Edit Pricing",
    wholesale: "Edit Wholesale",
  }[mode];
  const set = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));
  const rate = calculateLooseUnitPrice(
    form.packageSellingPrice,
    form.packageSize,
  );
  const gstEnabled = Boolean(settings?.gst?.enabled);
  const taxable = form.taxable !== false;
  const useDefaultGstRate = form.useDefaultGstRate !== false;
  const storeGstRate = Number(settings?.gst?.defaultRate || 0);
  const effectiveGstRate = taxable
    ? useDefaultGstRate
      ? storeGstRate
      : Number(form.gstRate || 0)
    : 0;
  const storePriceMode =
    settings?.gst?.priceMode === "EXCLUSIVE" ? "EXCLUSIVE" : "INCLUSIVE";
  const selectedPriceMode =
    form.gstPriceMode === "EXCLUSIVE" || form.gstPriceMode === "INCLUSIVE"
      ? form.gstPriceMode
      : storePriceMode;
  const taxPreview =
    form.packageSellingPrice !== ""
      ? calculateLineGST(
          {
            amount: form.packageSellingPrice,
            taxable,
            gstRate: effectiveGstRate,
            useDefaultGstRate: false,
            gstPriceMode: selectedPriceMode,
          },
          {
            settings: {
              ...settings,
              gst: {
                ...settings?.gst,
                enabled: gstEnabled,
                calculationMethod: "PRODUCT",
                allowProductSpecificRate: true,
              },
            },
            placeOfSupply: settings?.store?.stateCode,
          },
        )
      : null;
  const openingSealedPackages = Number(form.openingPackages || 0);
  const openingTotal = openingSealedPackages * Number(form.packageSize || 0);
  const displayUnit =
    form.baseUnit === "ml"
      ? "ml"
      : form.baseUnit === "g"
        ? "g"
        : form.baseUnit === "pcs"
          ? "pieces"
          : form.baseUnit;
  const packageName = form.packageType.toLowerCase();
  const amountLabel =
    form.baseUnit === "ml"
      ? `Volume inside One ${form.packageType} (ml)`
      : form.baseUnit === "g" || form.baseUnit === "kg"
        ? `Weight inside One ${form.packageType} (${form.baseUnit})`
        : form.baseUnit === "tablets"
          ? `Tablets in One ${form.packageType}`
      : form.baseUnit === "pcs"
        ? `Pieces in One ${form.packageType}`
        : `Amount in One ${form.packageType}`;
  const capabilityNames =
    [
      form.allowPackageSale && "Full Package",
      form.allowLooseSale && "Loose",
      form.allowLooseSale &&
        form.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED &&
        "Count Based",
      form.allowMixture && "Custom Mix",
    ]
      .filter(Boolean)
      .join(" · ") || "None";
  function addTier() {
    set("priceTiers", [...form.priceTiers, { quantity: "", price: "" }]);
  }
  function updateTier(index, field, value) {
    set(
      "priceTiers",
      form.priceTiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier,
      ),
    );
  }
  function addWholesaleTier() {
    set("wholesalePriceTiers", [
      ...form.wholesalePriceTiers,
      { quantity: "", price: "" },
    ]);
  }
  function updateWholesaleTier(index, field, value) {
    set(
      "wholesalePriceTiers",
      form.wholesalePriceTiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier,
      ),
    );
  }
  async function submit(event) {
    event.preventDefault();
    if (
      !form.name.trim() ||
      !form.categoryId ||
      !(Number(form.packageSize) > 0)
    )
      return toast.error("Please complete the required product fields.");
    if (!form.allowPackageSale && !form.allowLooseSale)
      return toast.error("Enable package sale or loose sale.");
    if (
      form.allowLooseSale &&
      form.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED
    ) {
      if (!form.looseUnit || !(Number(form.loosePricePerUnit) > 0))
        return toast.error(
          "Enter a loose selling unit and price greater than zero.",
        );
      if (
        form.looseConversionType === LOOSE_CONVERSION_TYPES.FIXED &&
        (!Number.isInteger(Number(form.unitsPerPackage)) ||
          Number(form.unitsPerPackage) <= 0)
      )
        return toast.error(
          "Units per package must be a positive whole number.",
        );
    }
    if (
      form.wholesaleEnabled &&
      (!(Number(form.wholesalePrice) >= 0) ||
        !Number.isInteger(Number(form.wholesaleMinQty)) ||
        Number(form.wholesaleMinQty) <= 0 ||
        !Number.isInteger(Number(form.unitsPerWholesalePack)) ||
        Number(form.unitsPerWholesalePack) <= 0)
    )
      return toast.error(
        "Complete the wholesale price, MOQ, and pack conversion.",
      );
    if (
      form.freeSchemeEnabled &&
      (!(Number(form.freeSchemeBuyQty) > 0) ||
        !(Number(form.freeSchemeFreeQty) > 0) ||
        (form.freeSchemeType === "DIFFERENT_PRODUCT" &&
          !form.freeSchemeFreeProduct))
    )
      return toast.error("Complete the wholesale free scheme.");
    if (
      !Number.isInteger(Number(form.unitsPerStockPack)) ||
      Number(form.unitsPerStockPack) <= 0 ||
      !Number.isInteger(Number(form.openingPackages || 0)) ||
      Number(form.openingPackages || 0) < 0
    )
      return toast.error(
        "Enter valid whole numbers for full stock and packages per box.",
      );
    if (form.batchTracking && !form.expiryDate)
      return toast.error("Expiry date is required for batch tracking.");
    if (
      form.manufacturingDate &&
      form.expiryDate &&
      new Date(form.expiryDate) <= new Date(form.manufacturingDate)
    )
      return toast.error("Expiry date must be after manufacturing date.");
    setSaving(true);
    try {
      const payload = {
        ...form,
        openingPackages: undefined,
        openingStockPacks: Math.floor(openingSealedPackages / Number(form.unitsPerStockPack)),
        openingIndividualPackages: openingSealedPackages % Number(form.unitsPerStockPack),
        openingQuantity: 0,
        id: product?._id,
        status: form.active ? "ACTIVE" : "INACTIVE",
      };
      await api("/api/products", {
        method: edit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success(
        edit
          ? "Product updated successfully."
          : "Product created successfully.",
      );
      onSaved();
    } catch (error) {
      if (/barcode.*(assigned|belongs|already)/i.test(error.message || "")) {
        const assignedTo = error.message.match(/^This barcode is already assigned to (.+)\.$/i)?.[1];
        toast.error("Barcode already in use", { description: assignedTo ? `This barcode is already assigned to “${assignedTo}”. Please use another barcode.` : "This barcode is already assigned to another product. Please use another barcode." });
      } else toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Modal onClose={onClose} wide={!mode}>
        <form onSubmit={submit}>
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4 sm:-top-7 sm:-mx-7 sm:-mt-7 sm:px-7">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
                {mode ? product.name : edit ? "Product master" : "New product"}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                {focusedTitle || (edit ? "Edit Product" : "Add Product")}
              </h2>
              {!edit && (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Enter the product details, selling options, price and current
                  stock.
                </p>
              )}
            </div>
            <button type="button" className="btn shrink-0 p-2" aria-label="Close product form" onClick={onClose}>
              <X />
            </button>
          </div>
          <div className="mt-6 grid gap-5">
            <Section
              title="1. Basic Information"
              subtitle="Enter the basic details used to identify this product."
              hidden={Boolean(mode)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <FieldLabel help="The name shown to staff and customers. Example: Dasamoolarishtam 450 ml.">
                    Product / Medicine Name *
                  </FieldLabel>
                  <input
                    className="field"
                    placeholder="Enter product name"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </label>
                <div className="min-w-0 sm:col-span-2">
                  <FieldLabel help="Enter the barcode printed on the product or scan it using a barcode scanner.">
                    Barcode (Optional)
                  </FieldLabel>
                  <BarcodeInput
                    value={form.barcode || ""}
                    onChange={(value) => set("barcode", value)}
                    barcodeType={form.barcodeType || "EAN13"}
                    onTypeChange={(value) => set("barcodeType", value)}
                    allowGenerate
                  />
                </div>
                <label>
                  <FieldLabel help="The company or manufacturer that makes the product. Example: Oushadhi, Kottakkal or Vaidyaratnam.">
                    Brand / Manufacturer
                  </FieldLabel>
                  <input
                    className="field"
                    placeholder="Enter brand or manufacturer"
                    value={form.manufacturer || ""}
                    onChange={(e) => set("manufacturer", e.target.value)}
                  />
                </label>
                <label className="min-w-0">
                  <FieldLabel help="The group this product belongs to for easier searching and reporting. Examples: Arishtam, Tablets, Oils and Choornam.">
                    Category *
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <select
                      className="field min-w-0 flex-1"
                      value={form.categoryId}
                      onChange={(e) => set("categoryId", e.target.value)}
                    >
                      <option value="">Choose a category</option>
                      {categories
                        .filter((item) => item.active !== false)
                        .map((item) => (
                          <option key={item._id} value={item._id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn whitespace-nowrap"
                      onClick={() => setCategoryOpen(true)}
                    >
                      <Plus size={16} />
                      Add Category
                    </button>
                    <FieldLabel help="Create a new category if the required category is not available." />
                  </div>
                </label>
                <label>
                  <FieldLabel help="Controls whether this product is active or inactive.">
                    Status
                  </FieldLabel>
                  <select
                    className="field"
                    value={form.active ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) => set("active", e.target.value === "ACTIVE")}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 pt-7 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={form.visibleInSales}
                    onChange={(e) => set("visibleInSales", e.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1.5">
                    Show in Sales Screen{" "}
                    <FieldLabel help="Controls whether staff can see this product on the POS sales screen." />
                  </span>
                </label>
              </div>
            </Section>
            <Section
              title="2. Package & Stock Measurement"
              subtitle="Tell us how this product is packed and how much is inside one package."
              hidden={Boolean(mode)}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label>
                  <FieldLabel help="How the quantity inside the package is measured. For example, Arishtam uses milliliters, Choornam uses grams, and tablets use tablets.">
                    Measured In *
                  </FieldLabel>
                  <select
                    className="field"
                    value={form.baseUnit}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        baseUnit: e.target.value,
                        packageUnit: e.target.value,
                      }))
                    }
                  >
                    {BASE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit === "ml"
                          ? "Milliliters (ml)"
                          : unit === "g"
                            ? "Grams (g)"
                            : unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel help="The physical package this product comes in. Examples: Bottle, Packet, Strip, Box or Jar.">
                    Package Type *
                  </FieldLabel>
                  <select
                    className="field"
                    value={form.packageType}
                    onChange={(e) => set("packageType", e.target.value)}
                  >
                    {PACKAGE_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel
                    help={`Enter how much product is inside one complete package. If one ${packageName} contains ${form.baseUnit === "ml" ? "450 ml" : form.baseUnit === "g" ? "100 g" : form.baseUnit === "tablets" ? "10 tablets" : "12 pieces"}, enter that amount.`}
                  >
                    {amountLabel} *
                  </FieldLabel>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={`Enter quantity inside one ${packageName}`}
                    value={form.packageSize}
                    onChange={(e) => set("packageSize", e.target.value)}
                  />
                </label>
                <label>
                  <FieldLabel help="The outer pack used to receive and count sealed stock. This does not change the product sold inside it.">
                    Outer Stock Pack
                  </FieldLabel>
                  <select
                    className="field"
                    value={form.stockPackType}
                    onChange={(e) => set("stockPackType", e.target.value)}
                  >
                    <option>Box</option>
                    <option>Carton</option>
                  </select>
                </label>
                <label>
                  <FieldLabel help={`Enter how many ${plural(form.packageType, 2)} are inside one ${form.stockPackType.toLowerCase()}. Example: 12 bottles per box.`}>
                    {plural(form.packageType, 2)} per {form.stockPackType} *
                  </FieldLabel>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    step="1"
                    value={form.unitsPerStockPack}
                    onChange={(e) => set("unitsPerStockPack", e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <strong>
                  One {form.packageType} Contains
                  <br />
                  {number(form.packageSize)} {displayUnit}
                </strong>
                <p className="mt-1">
                  1 {form.stockPackType} = {number(form.unitsPerStockPack)}{" "}
                  {plural(form.packageType, Number(form.unitsPerStockPack))}. Sealed stock is counted as {plural(form.packageType, 2)}; only an opened {form.packageType.toLowerCase()} is measured in {displayUnit}.
                </p>
              </div>
              {edit &&
                (product.stock?.hasStock ??
                  product.stock?.totalBaseQuantity > 0) && (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    Package size is locked while inventory exists. Use Stock
                    Adjustment for quantity changes.
                  </p>
                )}
            </Section>
            <Section
              title={mode ? "Product Sale" : "3. How Can This Product Be Sold?"}
              subtitle="Choose all the ways this product can be sold in the POS."
              hidden={Boolean(mode && mode !== "pricing")}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <ToggleCard
                  title="Sell Full Package"
                  help="Allows customers to buy the complete package."
                  checked={form.allowPackageSale}
                  onChange={(v) => set("allowPackageSale", v)}
                >
                  Sell the complete {packageName}. Enable this when customers
                  can buy the whole package.
                </ToggleCard>
                <ToggleCard
                  title="Sell Loose Quantity"
                  help="Allows customers to buy only part of an opened package."
                  checked={form.allowLooseSale}
                  onChange={(v) => set("allowLooseSale", v)}
                >
                  Sell only part of an opened package. Example:{" "}
                  {form.baseUnit === "ml"
                    ? "100 ml from a 450 ml bottle."
                    : form.baseUnit === "g"
                      ? "25 g from a 100 g packet."
                      : "2 tablets from a strip."}
                </ToggleCard>
                <ToggleCard
                  title="Allow in Custom Mix"
                  help="Allows this product to be combined with other products in a custom mixture."
                  checked={form.allowMixture}
                  onChange={(v) => set("allowMixture", v)}
                >
                  Allow this product to be used as an ingredient in a mixture.
                </ToggleCard>
              </div>
            </Section>
            <Section
              title={mode === "pricing" ? "Pricing" : "4. Pricing"}
              hidden={Boolean(mode && mode !== "pricing")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {form.allowPackageSale && (
                  <label>
                    <FieldLabel help="The selling price of one complete package. Example: one 450 ml bottle = ₹180.">
                      Full Package Selling Price
                    </FieldLabel>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Enter selling price"
                      value={form.packageSellingPrice}
                      onChange={(e) =>
                        set("packageSellingPrice", e.target.value)
                      }
                    />
                  </label>
                )}
                {form.allowLooseSale && (
                  <div className="rounded-xl bg-[#f4f7f3] p-4 text-sm">
                    <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                      {form.loosePricingMethod ===
                      LOOSE_PRICING_METHODS.COUNT_BASED
                        ? "Loose Selling Rate"
                        : "Calculated Price Per Unit"}{" "}
                      <FieldLabel help="Automatically calculated price for one ml, gram, tablet or piece." />
                    </span>
                    <strong className="mt-1 block text-lg">
                      {money(
                        form.loosePricingMethod ===
                          LOOSE_PRICING_METHODS.COUNT_BASED
                          ? form.loosePricePerUnit
                          : rate,
                      )}{" "}
                      /{" "}
                      {form.loosePricingMethod ===
                      LOOSE_PRICING_METHODS.COUNT_BASED
                        ? form.looseUnit
                        : form.baseUnit}
                    </strong>
                  </div>
                )}
              </div>
              {form.allowLooseSale && (
                <div className="mt-5">
                  <span className="label">Loose pricing method</span>
                  <div className="flex flex-wrap gap-4 text-sm font-bold">
                    {[
                      ["PROPORTIONAL", "Proportional package rate"],
                      ["CUSTOM", "Custom loose rate"],
                      ["TIERS", "Quantity price tiers"],
                      [
                        LOOSE_PRICING_METHODS.COUNT_BASED,
                        "Count-based loose sale",
                      ],
                    ].map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="looseMethod"
                          checked={form.loosePricingMethod === value}
                          onChange={() => set("loosePricingMethod", value)}
                        />{" "}
                        {label}
                      </label>
                    ))}
                  </div>
                  {form.loosePricingMethod === "CUSTOM" && (
                    <label className="mt-4 block max-w-sm">
                      <span className="label">
                        Loose rate / {form.baseUnit}
                      </span>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.loosePricePerUnit}
                        onChange={(e) =>
                          set("loosePricePerUnit", e.target.value)
                        }
                      />
                    </label>
                  )}
                  {form.loosePricingMethod === "TIERS" && (
                    <div className="mt-4 space-y-2">
                      {form.priceTiers.map((tier, index) => (
                        <div className="flex gap-2" key={index}>
                          <input
                            className="field"
                            type="number"
                            placeholder={`Quantity (${form.baseUnit})`}
                            value={tier.quantity}
                            onChange={(e) =>
                              updateTier(index, "quantity", e.target.value)
                            }
                          />
                          <input
                            className="field"
                            type="number"
                            placeholder="Price"
                            value={tier.price}
                            onChange={(e) =>
                              updateTier(index, "price", e.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="btn !px-3"
                            onClick={() =>
                              set(
                                "priceTiers",
                                form.priceTiers.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn" onClick={addTier}>
                        <Plus size={16} />
                        Add price tier
                      </button>
                    </div>
                  )}
                  {form.loosePricingMethod ===
                    LOOSE_PRICING_METHODS.COUNT_BASED && (
                    <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="label">Loose selling unit *</span>
                          <select
                            className="field"
                            value={form.looseUnit}
                            onChange={(e) => set("looseUnit", e.target.value)}
                          >
                            {LOOSE_UNITS.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit.charAt(0).toUpperCase() + unit.slice(1)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="label">
                            Selling price per loose unit *
                          </span>
                          <div className="flex rounded-xl border border-[var(--line)] bg-white">
                            <span className="grid px-3 font-bold">₹</span>
                            <input
                              className="min-w-0 flex-1 px-2 outline-none"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={form.loosePricePerUnit}
                              onChange={(e) =>
                                set("loosePricePerUnit", e.target.value)
                              }
                            />
                            <span className="grid border-l px-3 text-sm font-bold text-[var(--muted)]">
                              / {form.looseUnit}
                            </span>
                          </div>
                        </label>
                      </div>
                      <div className="mt-4">
                        <span className="label">
                          Quantity inside one {form.packageType}
                        </span>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="rounded-xl border bg-white p-3 text-sm font-bold">
                            <input
                              type="radio"
                              name="looseConversion"
                              checked={
                                form.looseConversionType ===
                                LOOSE_CONVERSION_TYPES.FIXED
                              }
                              onChange={() =>
                                set(
                                  "looseConversionType",
                                  LOOSE_CONVERSION_TYPES.FIXED,
                                )
                              }
                            />{" "}
                            Fixed quantity
                          </label>
                          <label className="rounded-xl border bg-white p-3 text-sm font-bold">
                            <input
                              type="radio"
                              name="looseConversion"
                              checked={
                                form.looseConversionType ===
                                LOOSE_CONVERSION_TYPES.COUNT_ON_OPEN
                              }
                              onChange={() =>
                                set(
                                  "looseConversionType",
                                  LOOSE_CONVERSION_TYPES.COUNT_ON_OPEN,
                                )
                              }
                            />{" "}
                            Unknown — count when package is opened
                          </label>
                        </div>
                      </div>
                      {form.looseConversionType ===
                      LOOSE_CONVERSION_TYPES.FIXED ? (
                        <label className="mt-4 block max-w-sm">
                          <span className="label">
                            {form.looseUnit.charAt(0).toUpperCase() +
                              form.looseUnit.slice(1)}
                            s per {form.packageType} *
                          </span>
                          <input
                            className="field"
                            type="number"
                            min="1"
                            step="1"
                            value={form.unitsPerPackage}
                            onChange={(e) =>
                              set("unitsPerPackage", e.target.value)
                            }
                          />
                          <small className="mt-2 block text-[var(--muted)]">
                            1 {form.packageType} ={" "}
                            {number(form.unitsPerPackage)} {form.looseUnit}s
                          </small>
                        </label>
                      ) : (
                        <p className="mt-4 text-sm text-emerald-900">
                          The quantity is not predefined. When a sealed{" "}
                          {form.packageType} is opened for loose sales, the
                          cashier will enter the actual {form.looseUnit} count.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>
            <Section
              title={mode ? "Wholesale" : "5. Wholesale"}
              subtitle="Use the same inventory for dealer, box, and carton sales."
              hidden={Boolean(mode && mode !== "pricing")}
            >
              <ToggleCard
                title="Enable Wholesale"
                help="Show this product in Wholesale mode with server-enforced wholesale pricing."
                checked={form.wholesaleEnabled}
                onChange={(value) => set("wholesaleEnabled", value)}
              >
                Wholesale uses the existing package stock. No separate box or
                carton stock is created.
              </ToggleCard>
              {form.wholesaleEnabled && (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label>
                      <span className="label">
                        Wholesale price / {form.packageType}
                      </span>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.wholesalePrice}
                        onChange={(event) =>
                          set("wholesalePrice", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span className="label">
                        Minimum order ({form.wholesaleUnit}s)
                      </span>
                      <input
                        className="field"
                        type="number"
                        min="1"
                        step="1"
                        value={form.wholesaleMinQty}
                        onChange={(event) =>
                          set("wholesaleMinQty", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span className="label">Wholesale pack</span>
                      <select
                        className="field"
                        value={form.wholesaleUnit}
                        onChange={(event) =>
                          set("wholesaleUnit", event.target.value)
                        }
                      >
                        {[
                          "Piece",
                          "Tablet",
                          "Bottle",
                          "Packet",
                          "Jar",
                          "Box",
                          "Carton",
                        ].map((unit) => (
                          <option key={unit}>{unit}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="label">
                        {form.packageType}s per {form.wholesaleUnit}
                      </span>
                      <input
                        className="field"
                        type="number"
                        min="1"
                        step="1"
                        value={form.unitsPerWholesalePack}
                        onChange={(event) =>
                          set("unitsPerWholesalePack", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                    1 {form.wholesaleUnit} ={" "}
                    {number(form.unitsPerWholesalePack)}{" "}
                    {plural(
                      form.packageType,
                      Number(form.unitsPerWholesalePack),
                    )}
                    . Selling wholesale deducts these actual packages from
                    current stock.
                  </p>
                  <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm font-bold">
                    <span>
                      Allow wholesale loose sale
                      <small className="mt-1 block font-medium text-[var(--muted)]">
                        Only enables loose wholesale when ordinary loose sale is
                        also configured.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--green)]"
                      checked={form.allowWholesaleLooseSale}
                      onChange={(event) =>
                        set("allowWholesaleLooseSale", event.target.checked)
                      }
                    />
                  </label>
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>Quantity price tiers</strong>
                        <p className="text-xs text-[var(--muted)]">
                          The highest qualifying quantity is applied
                          automatically.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        onClick={addWholesaleTier}
                      >
                        <Plus size={15} />
                        Add tier
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {form.wholesalePriceTiers.map((tier, index) => (
                        <div
                          className="grid grid-cols-[1fr_1fr_auto] gap-2"
                          key={index}
                        >
                          <input
                            className="field"
                            type="number"
                            min="1"
                            step="1"
                            placeholder={`Quantity (${form.packageType}s)`}
                            value={tier.quantity}
                            onChange={(event) =>
                              updateWholesaleTier(
                                index,
                                "quantity",
                                event.target.value,
                              )
                            }
                          />
                          <input
                            className="field"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={`Price / ${form.packageType}`}
                            value={tier.price}
                            onChange={(event) =>
                              updateWholesaleTier(
                                index,
                                "price",
                                event.target.value,
                              )
                            }
                          />
                          <button
                            type="button"
                            className="btn !px-3"
                            onClick={() =>
                              set(
                                "wholesalePriceTiers",
                                form.wholesalePriceTiers.filter(
                                  (_, i) => i !== index,
                                ),
                              )
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4">
                    <label className="flex items-center justify-between gap-4 text-sm font-bold">
                      <span>
                        Free quantity scheme
                        <small className="mt-1 block font-medium text-[var(--muted)]">
                          Automatically scales Buy X + Get Y Free.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--green)]"
                        checked={form.freeSchemeEnabled}
                        onChange={(event) =>
                          set("freeSchemeEnabled", event.target.checked)
                        }
                      />
                    </label>
                    {form.freeSchemeEnabled && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="label">Scheme type</span>
                          <select
                            className="field"
                            value={form.freeSchemeType}
                            onChange={(event) =>
                              set("freeSchemeType", event.target.value)
                            }
                          >
                            <option value="SAME_PRODUCT">
                              Same product free
                            </option>
                            <option value="DIFFERENT_PRODUCT">
                              Different product free
                            </option>
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label>
                            <span className="label">
                              Buy ({form.wholesaleUnit}s)
                            </span>
                            <input
                              className="field"
                              type="number"
                              min="1"
                              step="1"
                              value={form.freeSchemeBuyQty}
                              onChange={(event) =>
                                set("freeSchemeBuyQty", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span className="label">
                              Free ({form.freeSchemeType === "SAME_PRODUCT" ? `${form.wholesaleUnit}s` : "product packages"})
                            </span>
                            <input
                              className="field"
                              type="number"
                              min="1"
                              step="1"
                              value={form.freeSchemeFreeQty}
                              onChange={(event) =>
                                set("freeSchemeFreeQty", event.target.value)
                              }
                            />
                          </label>
                        </div>
                        {form.freeSchemeType === "DIFFERENT_PRODUCT" && (
                          <label className="sm:col-span-2">
                            <span className="label">Free product</span>
                            <select
                              className="field"
                              value={form.freeSchemeFreeProduct || ""}
                              onChange={(event) =>
                                set("freeSchemeFreeProduct", event.target.value)
                              }
                            >
                              <option value="">Select free product</option>
                              {products
                                .filter(
                                  (item) =>
                                    item._id !== product?._id &&
                                    item.active !== false,
                                )
                                .map((item) => (
                                  <option value={item._id} key={item._id}>
                                    {item.name} · {item.sku}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <p className="sm:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                          Buy {number(form.freeSchemeBuyQty)} {form.wholesaleUnit}
                          {number(form.freeSchemeBuyQty) === 1 ? "" : "s"} + Get{" "}
                          {number(form.freeSchemeFreeQty)}{" "}
                          {form.freeSchemeType === "SAME_PRODUCT"
                            ? form.wholesaleUnit
                            : "free product package"}
                          {number(form.freeSchemeFreeQty) === 1 ? "" : "s"} Free
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Section>
            <Section
              title="6. GST & Tax"
              subtitle="Choose how GST should be applied to this product."
              hidden={Boolean(mode)}
            >
              {!gstEnabled ? (
                <p className="rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  GST calculations are currently disabled in Store Settings.
                  Your saved product tax details will remain unchanged.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 text-sm font-bold">
                      <span className="inline-flex items-center gap-1.5">
                        Taxable Product{" "}
                        <FieldLabel help="Turn this on when GST applies to this product." />
                      </span>
                      <input
                        className="size-4 accent-[var(--green)]"
                        type="checkbox"
                        checked={taxable}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            taxable: event.target.checked,
                            gstExempt: !event.target.checked,
                            gstRate: event.target.checked ? current.gstRate : 0,
                          }))
                        }
                      />
                    </label>
                    {!taxable && (
                      <p className="rounded-xl bg-[#f4f7f3] p-3 text-sm text-[var(--muted)]">
                        GST will not be charged for this product.
                      </p>
                    )}
                    <label
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-bold ${taxable ? "border-[var(--line)]" : "border-[var(--line)] opacity-55"}`}
                    >
                      <span>
                        <span className="inline-flex items-center gap-1.5">
                          Use Store Default GST Rate{" "}
                          <FieldLabel help="Use the GST percentage configured in your store settings." />
                        </span>
                        <small className="mt-1 block font-medium text-[var(--muted)]">
                          Current Store Rate: {storeGstRate}%
                        </small>
                      </span>
                      <input
                        className="size-4 accent-[var(--green)]"
                        type="checkbox"
                        disabled={!taxable}
                        checked={useDefaultGstRate}
                        onChange={(event) =>
                          set("useDefaultGstRate", event.target.checked)
                        }
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <FieldLabel help="The GST percentage applied when this product is sold.">
                          GST Rate
                        </FieldLabel>
                        <select
                          className="field"
                          disabled={!taxable || useDefaultGstRate}
                          value={
                            useDefaultGstRate
                              ? String(storeGstRate)
                              : [0, 3, 5, 12, 18, 28].includes(
                                    Number(form.gstRate),
                                  )
                                ? String(form.gstRate)
                                : "CUSTOM"
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            set(
                              "gstRate",
                              value === "CUSTOM" ? "" : Number(value),
                            );
                          }}
                        >
                          {[0, 3, 5, 12, 18, 28].map((value) => (
                            <option value={value} key={value}>
                              {value}%
                              {useDefaultGstRate && value === storeGstRate
                                ? " • Store Default"
                                : ""}
                            </option>
                          ))}
                          {!useDefaultGstRate && (
                            <option value="CUSTOM">Custom</option>
                          )}
                        </select>
                      </label>
                      <label>
                        <FieldLabel help="The GST classification code for this product.">
                          HSN Code
                          {settings?.gst?.requireHsn && taxable ? " *" : ""}
                        </FieldLabel>
                        <input
                          className="field"
                          placeholder="Enter HSN code"
                          value={form.hsnCode || ""}
                          onChange={(event) =>
                            set("hsnCode", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    {taxable &&
                      !useDefaultGstRate &&
                      ![0, 3, 5, 12, 18, 28].includes(Number(form.gstRate)) && (
                        <label className="block max-w-xs">
                          <FieldLabel help="Enter a GST rate from 0% to 100%.">
                            Custom GST Rate
                          </FieldLabel>
                          <input
                            className="field"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={form.gstRate}
                            onChange={(event) =>
                              set("gstRate", event.target.value)
                            }
                            placeholder="Enter GST rate"
                          />
                        </label>
                      )}
                    <label className="block max-w-sm">
                      <FieldLabel help="Choose whether GST is already included in the selling price or added during checkout.">
                        Selling Price GST Mode
                      </FieldLabel>
                      <select
                        className="field"
                        disabled={!taxable}
                        value={form.gstPriceMode || "STORE"}
                        onChange={(event) =>
                          set("gstPriceMode", event.target.value)
                        }
                      >
                        <option value="STORE">Use Store Setting</option>
                        <option value="INCLUSIVE">GST Included in Price</option>
                        <option value="EXCLUSIVE">GST Added at Checkout</option>
                      </select>
                      <small className="mt-2 block text-[var(--muted)]">
                        {form.gstPriceMode === "STORE" || !form.gstPriceMode
                          ? `Store setting: GST is ${storePriceMode === "INCLUSIVE" ? "already included in the selling price." : "added during checkout."}`
                          : selectedPriceMode === "INCLUSIVE"
                            ? "GST is already included in the selling price."
                            : "GST will be added during checkout."}
                      </small>
                    </label>
                  </div>
                  <aside className="h-fit rounded-xl bg-[#f4f7f3] p-4 text-sm">
                    <strong>Tax Preview</strong>
                    {taxPreview ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between">
                          <span>Selling Price</span>
                          <b>{money(form.packageSellingPrice)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Taxable Value</span>
                          <b>{money(taxPreview.taxableValue)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>GST {effectiveGstRate}%</span>
                          <b>{money(taxPreview.totalGST)}</b>
                        </div>
                        <div className="flex justify-between border-t border-[var(--line)] pt-2">
                          <span>Customer Pays</span>
                          <b>{money(taxPreview.total)}</b>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                        Enter a selling price to preview GST.
                      </p>
                    )}
                  </aside>
                </div>
              )}
            </Section>
            <Section
              title="6. Current Stock & Low Stock Alert"
              hidden={Boolean(mode)}
              subtitle={
                edit
                  ? "Current inventory is changed only through ledger-backed adjustments."
                  : "Enter stock already available in your shop. Future stock can be added through Purchases."
              }
            >
              <label className="block max-w-sm">
                <FieldLabel
                  help={`The number of full-package equivalents at which the system should warn that stock is running low. Open stock counts as a fraction of one ${form.packageType}.`}
                >
                  Low Stock Alert At ({plural(form.packageType, 2)})
                </FieldLabel>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="any"
                  value={form.reorderLevel}
                  onChange={(e) => set("reorderLevel", e.target.value)}
                />
              </label>
              {!edit && (
                <div className="mt-5 grid gap-4">
                  <label className="block max-w-sm">
                    <FieldLabel help={`Enter the total number of full ${plural(form.packageType, 2).toLowerCase()} in stock, including those inside boxes or cartons.`}>
                      Full Stock ({plural(form.packageType, 2)})
                    </FieldLabel>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="1"
                      value={form.openingPackages}
                      onChange={(e) => set("openingPackages", e.target.value)}
                    />
                  </label>
                  <div className="rounded-xl bg-[#f4f7f3] p-4 text-sm">
                    <FieldLabel help="This is the total stock that will be saved when the product is created.">
                      Starting Stock
                    </FieldLabel>
                    <strong className="mt-1 block">
                      {number(openingSealedPackages)}{" "}
                      {plural(form.packageType, openingSealedPackages)}
                    </strong>
                    <p className="mt-1 text-[var(--muted)]">
                      {form.loosePricingMethod ===
                      LOOSE_PRICING_METHODS.COUNT_BASED
                        ? "Package weight and loose count remain separate."
                        : `Total Starting Stock: ${number(openingTotal)} ${displayUnit}`}
                    </p>
                  </div>
                </div>
              )}
            </Section>
            {!edit && (
              <Section
                title="7. Batch & Expiry"
                subtitle="Record the batch details and expiry date for the starting stock."
              >
                <label className="flex items-center gap-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={form.batchTracking}
                    onChange={(e) => set("batchTracking", e.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1.5">
                    Track Batch & Expiry{" "}
                    <FieldLabel help="Track stock using its batch number and expiry date." />
                  </span>
                </label>
                {form.batchTracking && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label>
                      <FieldLabel help="The batch or lot number printed on the package.">
                        Batch Number *
                      </FieldLabel>
                      <input
                        className="field"
                        placeholder="Example: B240812"
                        value={form.batchNumber}
                        onChange={(e) => set("batchNumber", e.target.value)}
                      />
                    </label>
                    <label>
                      <FieldLabel help="The supplier who provided this stock. Leave it empty if no supplier needs to be recorded.">
                        Supplier
                      </FieldLabel>
                      <select
                        className="field"
                        value={form.supplierId}
                        onChange={(e) => set("supplierId", e.target.value)}
                      >
                        <option value="">Select supplier (Optional)</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier._id} value={supplier._id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel help="The date this batch was manufactured, if available.">
                        Manufactured On
                      </FieldLabel>
                      <input
                        className="field"
                        type="date"
                        value={form.manufacturingDate}
                        onChange={(e) =>
                          set("manufacturingDate", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel help="The date after which this batch should no longer be sold.">
                        Expiry Date *
                      </FieldLabel>
                      <input
                        className="field"
                        type="date"
                        value={form.expiryDate}
                        onChange={(e) => set("expiryDate", e.target.value)}
                      />
                    </label>
                    <label>
                      <FieldLabel help="The amount the shop paid for one complete package of this product.">
                        Cost Price Per Package
                      </FieldLabel>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.purchasePrice}
                        onChange={(e) => set("purchasePrice", e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </Section>
            )}
            {!mode && (
              <section className="rounded-2xl bg-[#173d29] p-5 text-white">
              <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-200">
                Product summary
              </p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
                <div>
                  <span className="text-emerald-100/70">Product</span>
                  <strong className="block">
                    {form.name || "Not entered yet"}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-100/70">Package</span>
                  <strong className="block">
                    {form.packageType} • {number(form.packageSize)}{" "}
                    {displayUnit}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-100/70">Selling Options</span>
                  <strong className="block">{capabilityNames}</strong>
                </div>
                <div>
                  <span className="text-emerald-100/70">Starting Stock</span>
                  <strong className="block">
                    {edit
                      ? "Unchanged"
                      : form.loosePricingMethod ===
                          LOOSE_PRICING_METHODS.COUNT_BASED
                        ? `${number(openingSealedPackages)} ${plural(form.packageType, openingSealedPackages)}`
                        : `${number(openingTotal)} ${form.baseUnit}`}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-100/70">Tax</span>
                  <strong className="block">
                    {!gstEnabled
                      ? "GST Disabled"
                      : !taxable
                        ? "Not Taxable"
                        : `${useDefaultGstRate ? "Store Default • " : ""}GST ${effectiveGstRate}%${form.hsnCode ? ` • HSN ${form.hsnCode}` : ""}`}
                  </strong>
                </div>
              </div>
              </section>
            )}
          </div>
          <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 flex justify-end gap-3 border-t border-[var(--line)] bg-white px-5 py-4 sm:-bottom-7 sm:-mx-7 sm:-mb-7 sm:px-7">
            <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary flex-1 sm:flex-none" disabled={saving}>
              {saving
                ? "Saving…"
                : mode
                  ? `Save ${focusedTitle.replace("Edit ", "").toLowerCase()}`
                  : edit
                    ? "Save changes"
                    : "Create Product"}
            </button>
          </div>
        </form>
      </Modal>
      {categoryOpen && (
        <CategoryModal
          onClose={() => setCategoryOpen(false)}
          onCreated={(category) => {
            onCategory(category);
            set("categoryId", category._id);
            setCategoryOpen(false);
          }}
        />
      )}
    </>
  );
}

function AdjustmentModal({
  product,
  defaultDirection = "INCREASE",
  onClose,
  onSaved,
}) {
  const countBased =
    product.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED;
  const unitsPerStockPack = Math.max(1, Number(product.unitsPerStockPack || 1));
  const stockPackType = product.stockPackType || "Box";
  const stockPackPlural = stockPackType === "Box" ? "Boxes" : "Cartons";
  const currentSealedPackages = Number(product.stock?.sealedPackages || 0);
  const currentStockPacks = Math.floor(currentSealedPackages / unitsPerStockPack);
  const currentExtraPackages = currentSealedPackages % unitsPerStockPack;
  const [direction, setDirection] = useState(defaultDirection);
  const [saving, setSaving] = useState(false);
  const [stockEntry, setStockEntry] = useState({
    stockPacks: countBased ? currentStockPacks : 0,
    extraPackages: countBased ? currentExtraPackages : 0,
    openQuantity: countBased ? Number(product.stock?.openQuantity || 0) : 0,
  });
  const previewSealedPackages =
    Number(stockEntry.stockPacks || 0) * unitsPerStockPack +
    Number(stockEntry.extraPackages || 0);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const stockPacks = Number(values.stockPacks || 0);
    const extraPackages = Number(values.extraPackages || 0);
    const openQuantity = Number(values.openQuantity || 0);
    if (!Number.isInteger(stockPacks) || stockPacks < 0)
      return toast.error(`Enter a valid number of ${stockPackPlural.toLowerCase()}.`);
    if (!Number.isInteger(extraPackages) || extraPackages < 0)
      return toast.error(`Enter a valid number of extra ${plural(product.packageType, 2).toLowerCase()}.`);
    if (unitsPerStockPack > 1 && extraPackages >= unitsPerStockPack)
      return toast.error(`Extra ${plural(product.packageType, 2).toLowerCase()} must be fewer than ${unitsPerStockPack}; add another ${stockPackType.toLowerCase()} instead.`);
    if (!Number.isFinite(openQuantity) || openQuantity < 0 || (countBased && !Number.isInteger(openQuantity)))
      return toast.error(`${countBased ? product.looseUnit : product.baseUnit} quantity must be a non-negative ${countBased ? "whole number" : "number"}.`);
    const sealedPackages = stockPacks * unitsPerStockPack + extraPackages;
    const adjustmentQuantity = sealedPackages * Number(product.packageSize || 0) + openQuantity;
    if (!countBased && !(adjustmentQuantity > 0))
      return toast.error("Enter at least one box, package, or opened quantity.");
    setSaving(true);
    try {
      await api(
        `/api/products/${product._id}/${countBased ? "stock" : "adjustment"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            countBased
              ? {
                  ...values,
                  sealedPackages,
                  openQuantity,
                  note: values.notes,
                }
              : { ...values, quantity: adjustmentQuantity, direction },
          ),
        },
      );
      toast.success("Stock adjusted successfully.");
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
              Stock adjustment
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">{product.name}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-5 rounded-xl bg-[#f4f7f3] p-4">
          <span className="text-xs uppercase text-[var(--muted)]">
            Current inventory
          </span>
          <strong className="mt-1 block">{product.stockLabel}</strong>
          {!countBased && (
            <small>
              {number(product.stock?.totalBaseQuantity)} {product.baseUnit}{" "}
              total
            </small>
          )}
        </div>
        {!countBased && (
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#eef2ed] p-1">
            <button
              type="button"
              className={`rounded-lg p-3 font-bold ${direction === "INCREASE" ? "bg-white text-[var(--green)] shadow-sm" : ""}`}
              onClick={() => setDirection("INCREASE")}
            >
              <ArrowUp className="mr-2 inline" size={16} />
              Increase
            </button>
            <button
              type="button"
              className={`rounded-lg p-3 font-bold ${direction === "DECREASE" ? "bg-white text-red-700 shadow-sm" : ""}`}
              onClick={() => setDirection("DECREASE")}
            >
              <ArrowDown className="mr-2 inline" size={16} />
              Decrease
            </button>
          </div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-3 text-sm sm:col-span-2">
            1 {stockPackType} = <strong>{unitsPerStockPack} {plural(product.packageType, unitsPerStockPack)}</strong>. {countBased ? "Set the complete physical count below." : `${direction === "INCREASE" ? "Add" : "Remove"} boxes, individual packages, or opened ${product.baseUnit}.`}
          </div>
          <label>
            <span className="label">{countBased ? "Current" : direction === "INCREASE" ? "Add" : "Remove"} {stockPackPlural}</span>
            <input
              className="field"
              name="stockPacks"
              type="number"
              min="0"
              step="1"
              value={stockEntry.stockPacks}
              onChange={(event) => setStockEntry((current) => ({ ...current, stockPacks: event.target.value }))}
              required
            />
          </label>
          <label>
            <span className="label">{countBased ? "Current extra" : direction === "INCREASE" ? "Add extra" : "Remove extra"} {plural(product.packageType, 2)}</span>
            <input
              className="field"
              name="extraPackages"
              type="number"
              min="0"
              step="1"
              value={stockEntry.extraPackages}
              onChange={(event) => setStockEntry((current) => ({ ...current, extraPackages: event.target.value }))}
              required
            />
          </label>
          <label>
            <span className="label">
              {countBased ? "Open loose stock currently remaining" : `${direction === "INCREASE" ? "Add" : "Remove"} opened quantity`} ({countBased ? product.looseUnit : product.baseUnit})
            </span>
            <input
              className="field"
              name="openQuantity"
              type="number"
              min="0"
              step={countBased ? "1" : "any"}
              value={stockEntry.openQuantity}
              onChange={(event) => setStockEntry((current) => ({ ...current, openQuantity: event.target.value }))}
              required
            />
          </label>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm sm:col-span-2">
            <strong>{number(stockEntry.stockPacks)} {Number(stockEntry.stockPacks) === 1 ? stockPackType : stockPackPlural} × {unitsPerStockPack} + {number(stockEntry.extraPackages)} extra = {number(previewSealedPackages)} {plural(product.packageType, previewSealedPackages)}</strong>
            {Number(stockEntry.openQuantity) > 0 && <span> + {number(stockEntry.openQuantity)} {countBased ? product.looseUnit : product.baseUnit} open</span>}
          </div>
          <label>
            <span className="label">Reason *</span>
            <select className="field" name="reason" required>
              {[
                "Physical Count Correction",
                "Damage",
                "Expired",
                "Broken Package",
                "Lost Stock",
                "Manual Correction",
                "Other",
              ].map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="label">Notes</span>
            <textarea className="field min-h-24" name="notes" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Adjusting…" : "Confirm adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProductDrawer({
  productId,
  initialSection,
  onClose,
  onEdit,
  onAdjust,
}) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const stockHistoryRef = useRef(null);
  const salesHistoryRef = useRef(null);
  const batchesRef = useRef(null);
  useEffect(() => {
    api(`/api/products/${productId}`)
      .then(setProduct)
      .catch((e) => setError(e.message));
  }, [productId]);
  useEffect(() => {
    if (!product) return;
    const target =
      initialSection === "batches"
        ? batchesRef
        : initialSection === "stockHistory"
        ? stockHistoryRef
        : initialSection === "salesHistory"
          ? salesHistoryRef
          : null;
    if (!target?.current) return;
    const frame = window.requestAnimationFrame(() =>
      target.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [initialSection, product]);
  if (!product)
    return (
      <Drawer onClose={onClose}>
        <div className="flex justify-end">
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="grid min-h-64 place-items-center text-sm text-[var(--muted)]">
          {error || "Loading product details…"}
        </div>
      </Drawer>
    );
  const countBased =
    product.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED;
  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
            Product details
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">{product.name}</h2>
          <p className="text-sm text-[var(--muted)]">{product.sku}</p>
        </div>
        <button onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill tone={product.active !== false ? "green" : "gray"}>
          {product.active !== false ? "Active" : "Inactive"}
        </Pill>
        <Pill tone={product.visibleInSales !== false ? "blue" : "gray"}>
          {product.visibleInSales !== false ? "Visible" : "Hidden"}
        </Pill>
        {product.allowMixture && <Pill>Mix enabled</Pill>}
        {countBased && <Pill tone="amber">Count Based</Pill>}
      </div>
      <div className="mt-6 space-y-5">
        <Section title="Product">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Category</dt>
              <dd className="font-bold">{product.categoryId?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Brand</dt>
              <dd className="font-bold">{product.manufacturer || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Barcode</dt>
              <dd className="flex items-center gap-2 font-bold">{product.barcode || "—"}{product.barcode&&<button type="button" className="text-[var(--green)]" title="Copy barcode" aria-label={`Copy barcode ${product.barcode}`} onClick={async()=>{await navigator.clipboard.writeText(product.barcode);toast.success("Barcode copied");}}><Copy size={15}/></button>}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Package</dt>
              <dd className="font-bold">
                {number(product.packageSize)} {product.baseUnit} /{" "}
                {product.packageType}
              </dd>
            </div>
          </dl>
        </Section>
        <Section title="Inventory">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--muted)]">Physical stock</span>
              <strong className="block">{product.stockLabel}</strong>
            </div>
            {!countBased && (
              <div>
                <span className="text-[var(--muted)]">Total stock</span>
                <strong className="block">
                  {number(product.stock.totalBaseQuantity)} {product.baseUnit}
                </strong>
              </div>
            )}
            <div>
              <span className="text-[var(--muted)]">Reorder level</span>
              <strong className="block">
                {number(product.reorderLevel)}{" "}
                {plural(product.packageType, Number(product.reorderLevel))}
              </strong>
            </div>
            <div>
              <span className="text-[var(--muted)]">Batches</span>
              <strong className="block">
                {product.activeBatchCount} active
              </strong>
            </div>
          </div>
        </Section>
        <Section title="Pricing">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--muted)]">Package price</span>
              <strong className="block">
                {money(product.packageSellingPrice)}
              </strong>
            </div>
            {product.allowLooseSale && (
              <div>
                <span className="text-[var(--muted)]">Loose price</span>
                <strong className="block">
                  {money(product.loosePricePerUnit)} /{" "}
                  {countBased ? product.looseUnit : product.baseUnit}
                </strong>
              </div>
            )}
          </div>
        </Section>
        <Section title="Capabilities">
          <div className="flex flex-wrap gap-2">
            {product.allowPackageSale && <Pill>Package sale</Pill>}
            {product.allowLooseSale && <Pill>Loose sale</Pill>}
            {product.allowMixture && <Pill>Custom mix</Pill>}
          </div>
        </Section>
        <Section title="Batches" sectionRef={batchesRef}>
          {product.batches.length ? (
            <div className="divide-y">
              {product.batches.map((batch) => (
                <div
                  className="flex justify-between gap-4 py-3 text-sm"
                  key={batch._id}
                >
                  <div>
                    <strong>{batch.batchNumber}</strong>
                    <p className="text-[var(--muted)]">
                      Expiry: {date(batch.expiryDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <strong>
                      {countBased ? (
                        `${number(batch.sealedPackages)} ${plural(product.packageType, Number(batch.sealedPackages))}${Number(batch.openQuantity) > 0 ? ` + ${number(batch.openQuantity)} ${product.looseUnit}s` : ""}`
                      ) : (
                        <>
                          {number(
                            Number(batch.sealedPackages) *
                              Number(batch.packageSize) +
                              Number(batch.openQuantity),
                          )}{" "}
                          {product.baseUnit}
                        </>
                      )}
                    </strong>
                    <p className="text-[var(--muted)]">
                      {batch.supplierId?.name || "No supplier"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No batches recorded.</p>
          )}
        </Section>
        <Section title="Stock history" sectionRef={stockHistoryRef}>
          {product.history.length ? (
            <div className="divide-y">
              {product.history.slice(0, 20).map((entry) => (
                <div
                  className="flex justify-between gap-4 py-3 text-sm"
                  key={entry._id}
                >
                  <div>
                    <strong>{entry.type.replaceAll("_", " ")}</strong>
                    <p className="text-[var(--muted)]">
                      {entry.reason ||
                        entry.note ||
                        entry.referenceType ||
                        "Inventory movement"}{" "}
                      · {date(entry.createdAt)}
                    </p>
                  </div>
                  <strong
                    className={
                      entry.baseQuantity >= 0
                        ? "text-[var(--green)]"
                        : "text-red-700"
                    }
                  >
                    {entry.type === "PACKAGE_OPENED" ? (
                      `Opened 1 ${product.packageType} → ${number(entry.looseQuantity || entry.baseQuantity)} ${entry.looseUnit || product.looseUnit}s`
                    ) : (
                      <>
                        {entry.baseQuantity >= 0 ? "+" : ""}
                        {number(entry.baseQuantity)}{" "}
                        {entry.unit || product.baseUnit}
                      </>
                    )}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No stock movements recorded.
            </p>
          )}
        </Section>
        <Section title="Sales history" sectionRef={salesHistoryRef}>
          {product.salesHistory?.length ? (
            <div className="divide-y">
              {product.salesHistory.map((sale) => (
                <div
                  className="flex justify-between gap-4 py-3 text-sm"
                  key={sale._id}
                >
                  <div>
                    <strong>{sale.invoiceNumber}</strong>
                    <p className="text-[var(--muted)]">
                      {sale.customerSnapshot?.name || "Walk-in Customer"} ·{" "}
                      {date(sale.createdAt)}
                    </p>
                  </div>
                  <strong>
                    {money(
                      sale.items
                        .filter(
                          (item) =>
                            String(item.productId) === String(product._id) ||
                            item.ingredients?.some(
                              (ingredient) =>
                                String(ingredient.productId) ===
                                String(product._id),
                            ),
                        )
                        .reduce(
                          (sum, item) => sum + Number(item.total || 0),
                          0,
                        ),
                    )}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No sales recorded for this product.
            </p>
          )}
        </Section>
      </div>
      <div className="sticky bottom-0 -mx-7 mt-6 flex gap-2 border-t bg-white px-7 py-4">
        <button className="btn flex-1" onClick={() => onEdit(product)}>
          <Edit3 size={16} />
          Edit product
        </button>
        <button
          className="btn btn-primary flex-1"
          onClick={() => onAdjust(product)}
        >
          <SlidersHorizontal size={16} />
          Stock adjustment
        </button>
      </div>
    </Drawer>
  );
}

const IMPORT_FIELDS = [
  "Ignore Column",
  "name",
  "sku",
  "barcode",
  "manufacturer",
  "hsn_code",
  "taxable",
  "use_default_gst_rate",
  "gst_rate",
  "gst_price_mode",
  "category",
  "base_unit",
  "package_unit",
  "package_type",
  "package_size",
  "package_price",
  "allow_package_sale",
  "allow_loose_sale",
  "loose_pricing_method",
  "loose_price",
  "loose_unit",
  "loose_conversion_type",
  "units_per_package",
  "price_tiers",
  "allow_mix",
  "wholesale_enabled",
  "wholesale_price",
  "wholesale_min_qty",
  "wholesale_unit",
  "units_per_wholesale_pack",
  "wholesale_price_tiers",
  "allow_wholesale_loose_sale",
  "free_scheme_enabled",
  "free_scheme_type",
  "free_scheme_buy_qty",
  "free_scheme_free_qty",
  "reorder_level",
  "opening_packages",
  "opening_quantity",
  "batch_tracking",
  "batch_number",
  "manufacturing_date",
  "expiry_date",
  "purchase_price",
  "supplier",
  "pos_visible",
  "status",
];
const REQUIRED_IMPORT = [
  "name",
  "sku",
  "category",
  "base_unit",
  "package_type",
  "package_size",
  "package_price",
];
const aliases = {
  ...Object.fromEntries(IMPORT_FIELDS.slice(1).map((field) => [field, field])),
  "medicine name": "name",
  name: "name",
  "product code": "sku",
  sku: "sku",
  "barcode number": "barcode",
  barcode: "barcode",
  brand: "manufacturer",
  manufacturer: "manufacturer",
  type: "category",
  category: "category",
  unit: "base_unit",
  base_unit: "base_unit",
  pack: "package_type",
  package_type: "package_type",
  "pack qty": "package_size",
  package_size: "package_size",
  mrp: "package_price",
  package_price: "package_price",
};

function ImportWizard({ categories, onClose, onImported }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  function load(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return toast.error("CSV must be 10 MB or smaller");
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (parsed) => {
        const fields = parsed.meta.fields || [];
        setHeaders(fields);
        setRawRows(parsed.data);
        setMapping(
          Object.fromEntries(
            fields.map((header) => [
              header,
              aliases[header.trim().toLowerCase()] || "Ignore Column",
            ]),
          ),
        );
        setStep(2);
      },
      error: (error) => toast.error(error.message),
    });
  }
  const mappedRows = useMemo(
    () =>
      rawRows.map((row) =>
        Object.fromEntries(
          headers.flatMap((header) =>
            mapping[header] && mapping[header] !== "Ignore Column"
              ? [[mapping[header], row[header]]]
              : [],
          ),
        ),
      ),
    [rawRows, headers, mapping],
  );
  const categoryNames = useMemo(
    () => new Set(categories.map((item) => item.name.toLowerCase())),
    [categories],
  );
  const preview = useMemo(
    () =>
      mappedRows.map((row, index) => {
        const errors = [];
        for (const field of REQUIRED_IMPORT)
          if (!String(row[field] || "").trim())
            errors.push(`${field} is required`);
        if (row.base_unit && !BASE_UNITS.includes(String(row.base_unit).trim()))
          errors.push(`Invalid base unit \"${row.base_unit}\"`);
        if (row.package_size && !(Number(row.package_size) > 0))
          errors.push("Package size must be greater than zero");
        if (
          row.category &&
          !categoryNames.has(String(row.category).trim().toLowerCase())
        )
          errors.push("Unknown category");
        const sku = String(row.sku || "").toUpperCase();
        if (
          sku &&
          mappedRows.findIndex(
            (candidate) => String(candidate.sku || "").toUpperCase() === sku,
          ) !== index
        )
          errors.push("Duplicate SKU in file");
        return { row, index: index + 2, errors };
      }),
    [mappedRows, categoryNames],
  );
  const valid = preview.filter((entry) => !entry.errors.length);
  const failed = preview.filter((entry) => entry.errors.length);
  function template() {
    const category = categories[0]?.name || "REPLACE_WITH_EXISTING_CATEGORY";
    const emptyRow = () =>
      Object.fromEntries(IMPORT_FIELDS.slice(1).map((field) => [field, ""]));
    const packageSample = {
      ...emptyRow(),
      name: "Sample Herbal Oil",
      sku: "SAMPLE-OIL-200",
      manufacturer: "Sample Ayurveda",
      hsn_code: "30049011",
      taxable: "true",
      use_default_gst_rate: "true",
      gst_price_mode: "STORE",
      category,
      base_unit: "ml",
      package_unit: "ml",
      package_type: "Bottle",
      package_size: "200",
      package_price: "180",
      allow_package_sale: "true",
      allow_loose_sale: "true",
      loose_pricing_method: "TIERS",
      price_tiers: "50:48|100:90",
      allow_mix: "true",
      wholesale_enabled: "true",
      wholesale_price: "160",
      wholesale_min_qty: "6",
      wholesale_unit: "Carton",
      units_per_wholesale_pack: "12",
      wholesale_price_tiers: "12:155|24:150",
      allow_wholesale_loose_sale: "false",
      free_scheme_enabled: "true",
      free_scheme_type: "SAME_PRODUCT",
      free_scheme_buy_qty: "10",
      free_scheme_free_qty: "1",
      reorder_level: "1000",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      purchase_price: "120",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const countSample = {
      ...emptyRow(),
      name: "Sample Ayurvedic Tablets",
      sku: "SAMPLE-TAB-JAR",
      manufacturer: "Sample Ayurveda",
      taxable: "true",
      use_default_gst_rate: "false",
      gst_rate: "5",
      gst_price_mode: "INCLUSIVE",
      category,
      base_unit: "kg",
      package_unit: "kg",
      package_type: "Jar",
      package_size: "1",
      package_price: "900",
      allow_package_sale: "true",
      allow_loose_sale: "true",
      loose_pricing_method: "count_based",
      loose_price: "3",
      loose_unit: "tablet",
      loose_conversion_type: "count_on_open",
      allow_mix: "false",
      wholesale_enabled: "false",
      reorder_level: "5",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const powderSample = {
      ...emptyRow(),
      name: "Sample Herbal Powder",
      sku: "SAMPLE-POWDER-100",
      manufacturer: "Sample Ayurveda",
      hsn_code: "30049011",
      taxable: "true",
      use_default_gst_rate: "true",
      gst_price_mode: "STORE",
      category,
      base_unit: "g",
      package_unit: "g",
      package_type: "Packet",
      package_size: "100",
      package_price: "85",
      allow_package_sale: "true",
      allow_loose_sale: "true",
      loose_pricing_method: "PROPORTIONAL",
      allow_mix: "true",
      wholesale_enabled: "false",
      reorder_level: "500",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      purchase_price: "55",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const syrupSample = {
      ...emptyRow(),
      name: "Sample Herbal Syrup",
      sku: "SAMPLE-SYRUP-100",
      manufacturer: "Sample Ayurveda",
      hsn_code: "30049011",
      taxable: "true",
      use_default_gst_rate: "true",
      gst_price_mode: "STORE",
      category,
      base_unit: "ml",
      package_unit: "ml",
      package_type: "Bottle",
      package_size: "100",
      package_price: "120",
      allow_package_sale: "true",
      allow_loose_sale: "false",
      allow_mix: "false",
      wholesale_enabled: "true",
      wholesale_price: "105",
      wholesale_min_qty: "12",
      wholesale_unit: "Carton",
      units_per_wholesale_pack: "24",
      free_scheme_enabled: "false",
      reorder_level: "600",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      purchase_price: "75",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const capsuleSample = {
      ...emptyRow(),
      name: "Sample Herbal Capsules",
      sku: "SAMPLE-CAP-STRIP",
      manufacturer: "Sample Ayurveda",
      taxable: "true",
      use_default_gst_rate: "false",
      gst_rate: "5",
      gst_price_mode: "INCLUSIVE",
      category,
      base_unit: "tablets",
      package_unit: "tablets",
      package_type: "Strip",
      package_size: "10",
      package_price: "80",
      allow_package_sale: "true",
      allow_loose_sale: "true",
      loose_pricing_method: "count_based",
      loose_price: "9",
      loose_unit: "capsule",
      loose_conversion_type: "fixed",
      units_per_package: "10",
      allow_mix: "false",
      wholesale_enabled: "false",
      reorder_level: "100",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      purchase_price: "48",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const creamSample = {
      ...emptyRow(),
      name: "Sample Herbal Cream",
      sku: "SAMPLE-CREAM-30",
      manufacturer: "Sample Ayurveda",
      taxable: "true",
      use_default_gst_rate: "true",
      gst_price_mode: "STORE",
      category,
      base_unit: "g",
      package_unit: "g",
      package_type: "Tube",
      package_size: "30",
      package_price: "140",
      allow_package_sale: "true",
      allow_loose_sale: "false",
      allow_mix: "false",
      wholesale_enabled: "false",
      reorder_level: "300",
      opening_packages: "0",
      opening_quantity: "0",
      batch_tracking: "false",
      purchase_price: "90",
      pos_visible: "true",
      status: "ACTIVE",
    };
    const csv = Papa.unparse(
      [
        packageSample,
        countSample,
        powderSample,
        syrupSample,
        capsuleSample,
        creamSample,
      ],
      {
        columns: IMPORT_FIELDS.slice(1),
        newline: "\r\n",
      },
    );
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oushadi-products-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function errorReport() {
    const rows = (result?.results || [])
      .filter((entry) => entry.status !== "IMPORTED")
      .map((entry) => ({
        row: entry.row,
        sku: mappedRows[entry.row - 2]?.sku || "",
        product_name: entry.name,
        field: "",
        error: (entry.errors || []).join("; "),
      }));
    const url = URL.createObjectURL(
      new Blob([Papa.unparse(rows)], { type: "text/csv" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oushadi-product-import-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function run() {
    setImporting(true);
    try {
      const response = await api("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: mappedRows,
          createMissingCategories: false,
          duplicateMode: "SKIP",
        }),
      });
      setResult(response);
      setStep(4);
      if (response.imported) {
        toast.success(`${response.imported} products imported successfully.`);
        onImported();
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  }
  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">
            Bulk product import
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">Import products</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add multiple products and opening stock using CSV.
          </p>
        </div>
        <button onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="mt-6 grid grid-cols-4 gap-2">
        {["Upload", "Map columns", "Validate", "Import"].map((label, index) => (
          <div
            className={`rounded-xl border p-3 text-center text-xs font-extrabold ${step === index + 1 ? "border-[var(--green)] bg-emerald-50 text-[var(--green)]" : step > index + 1 ? "border-emerald-200 text-[var(--green)]" : "text-[var(--muted)]"}`}
            key={label}
          >
            {step > index + 1 ? (
              <Check className="mr-1 inline" size={14} />
            ) : (
              index + 1
            )}
            . {label}
          </div>
        ))}
      </div>
      {step === 1 && (
        <div className="mt-6">
          <button
            className="grid min-h-64 w-full place-items-center rounded-2xl border-2 border-dashed border-[#9eb1a2] bg-[#f7faf6] p-8 text-center"
            onClick={() => inputRef.current?.click()}
          >
            <span>
              <Upload className="mx-auto text-[var(--green)]" size={34} />
              <strong className="mt-4 block text-lg">
                Drag & drop CSV here
              </strong>
              <span className="mt-2 block text-sm text-[var(--muted)]">
                or choose a CSV file · Maximum size 10 MB
              </span>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => load(e.target.files?.[0])}
              />
            </span>
          </button>
          <button className="btn mt-4" onClick={template}>
            <Download size={16} />
            Download CSV template
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="mt-6">
          <div className="mb-4">
            <strong>{fileName}</strong>
            <p className="text-sm text-[var(--muted)]">
              Map each CSV column to a product field.
            </p>
          </div>
          <div className="card max-h-[52vh] divide-y overflow-auto">
            {headers.map((header) => (
              <div
                className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_auto_1fr]"
                key={header}
              >
                <strong className="text-sm">{header}</strong>
                <ChevronRight size={16} />
                <select
                  className="field !min-h-10"
                  value={mapping[header]}
                  onChange={(e) =>
                    setMapping((current) => ({
                      ...current,
                      [header]: e.target.value,
                    }))
                  }
                >
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field}>{field}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-between">
            <button className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              Validate rows
            </button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <small className="text-[var(--muted)]">Valid</small>
              <strong className="mt-1 block text-2xl text-[var(--green)]">
                {valid.length}
              </strong>
            </div>
            <div className="card p-4">
              <small className="text-[var(--muted)]">Errors</small>
              <strong className="mt-1 block text-2xl text-red-700">
                {failed.length}
              </strong>
            </div>
            <div className="card p-4">
              <small className="text-[var(--muted)]">Total rows</small>
              <strong className="mt-1 block text-2xl">{preview.length}</strong>
            </div>
          </div>
          <div className="table-wrap card mt-4 max-h-80">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((entry) => (
                  <tr key={entry.index}>
                    <td>{entry.index}</td>
                    <td className="font-bold">{entry.row.name || "—"}</td>
                    <td>{entry.row.sku || "—"}</td>
                    <td>{entry.row.category || "—"}</td>
                    <td>
                      {entry.errors.length ? (
                        <span className="text-xs font-bold text-red-700">
                          {entry.errors.join("; ")}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-[var(--green)]">
                          <CheckCircle2 className="mr-1 inline" size={14} />
                          Valid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex justify-between">
            <button className="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={!valid.length || importing}
              onClick={run}
            >
              {importing
                ? `Importing ${valid.length} products…`
                : `Import ${valid.length} products`}
            </button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="mt-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-[var(--green)]">
            <CheckCircle2 size={38} />
          </span>
          <h3 className="mt-4 text-2xl font-extrabold">Import completed</h3>
          <div className="mx-auto mt-5 grid max-w-2xl grid-cols-3 gap-3">
            <div className="card p-4">
              <strong className="text-2xl text-[var(--green)]">
                {result?.imported || 0}
              </strong>
              <p className="text-sm text-[var(--muted)]">Products created</p>
            </div>
            <div className="card p-4">
              <strong className="text-2xl text-amber-700">
                {result?.skipped || 0}
              </strong>
              <p className="text-sm text-[var(--muted)]">Existing skipped</p>
            </div>
            <div className="card p-4">
              <strong className="text-2xl text-red-700">
                {result?.failed || 0}
              </strong>
              <p className="text-sm text-[var(--muted)]">Rows failed</p>
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            {(result?.failed || result?.skipped) > 0 && (
              <button className="btn" onClick={errorReport}>
                <Download size={16} />
                Download import report
              </button>
            )}
            <button className="btn btn-primary" onClick={onClose}>
              View products
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BulkUpdateModal({ count, onClose, onApply }) {
  const [wholesaleStatus, setWholesaleStatus] = useState("");
  const [pricingMethod, setPricingMethod] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [wholesaleDiscount, setWholesaleDiscount] = useState("");
  const [wholesaleMinQty, setWholesaleMinQty] = useState("");
  const [wholesaleSaleUnit, setWholesaleSaleUnit] = useState("");
  const [wholesalePack, setWholesalePack] = useState("");
  const [unitsPerWholesalePack, setUnitsPerWholesalePack] = useState("");
  const [wholesalePackPrice, setWholesalePackPrice] = useState("");
  const [wholesaleLoose, setWholesaleLoose] = useState("");
  const [wholesaleLoosePrice, setWholesaleLoosePrice] = useState("");
  const [freeScheme, setFreeScheme] = useState("");
  const [saving, setSaving] = useState(false);

  function optionalNumber(value, label, { integer = false, max } = {}) {
    if (value === "") return undefined;
    const parsed = Number(value);
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      (integer && (!Number.isInteger(parsed) || parsed < 1)) ||
      (max !== undefined && parsed > max)
    ) {
      toast.error(`${label} is invalid.`);
      return null;
    }
    return parsed;
  }

  async function submit(event) {
    event.preventDefault();
    const changes = {};
    const fixedPrice =
      pricingMethod === "FIXED"
        ? optionalNumber(wholesalePrice, "Wholesale price")
        : undefined;
    const discount =
      pricingMethod === "DISCOUNT_FROM_RETAIL"
        ? optionalNumber(wholesaleDiscount, "Wholesale discount", { max: 100 })
        : undefined;
    const minimum = optionalNumber(
      wholesaleMinQty,
      "Minimum wholesale quantity",
      { integer: true },
    );
    const packagesPerPack = optionalNumber(
      unitsPerWholesalePack,
      "Packages per wholesale pack",
      { integer: true },
    );
    const packPrice =
      wholesalePack === "DISABLED"
        ? undefined
        : optionalNumber(wholesalePackPrice, "Wholesale pack price");
    const loosePrice =
      wholesaleLoose === "DISABLED"
        ? undefined
        : optionalNumber(wholesaleLoosePrice, "Wholesale loose price");
    if (
      [fixedPrice, discount, minimum, packagesPerPack, packPrice, loosePrice].includes(
        null,
      )
    )
      return;

    if (wholesaleStatus)
      changes.wholesaleEnabled = wholesaleStatus === "ENABLED";
    if (pricingMethod) changes.wholesalePricingMethod = pricingMethod;
    if (fixedPrice !== undefined) changes.wholesalePrice = fixedPrice;
    if (discount !== undefined)
      changes.wholesaleDiscountPercent = discount;
    if (minimum !== undefined) changes.wholesaleMinQty = minimum;
    if (wholesaleSaleUnit)
      changes.wholesaleSaleUnit = wholesaleSaleUnit;
    if (wholesalePack)
      changes.wholesalePackEnabled = wholesalePack === "ENABLED";
    if (packagesPerPack !== undefined)
      changes.unitsPerWholesalePack = packagesPerPack;
    if (packPrice !== undefined) changes.wholesalePackPrice = packPrice;
    if (wholesaleLoose)
      changes.allowWholesaleLooseSale = wholesaleLoose === "ENABLED";
    if (loosePrice !== undefined)
      changes.wholesaleLoosePrice = loosePrice;
    if (freeScheme)
      changes.freeSchemeEnabled = freeScheme === "ENABLED";
    if (!Object.keys(changes).length)
      return toast.error("Choose at least one wholesale field to update.");
    setSaving(true);
    try {
      await onApply(changes);
    } finally {
      setSaving(false);
    }
  }

  const currencyField = (label, value, setValue) => (
    <label>
      <span className="label">{label}</span>
      <span className="flex overflow-hidden rounded-xl border border-[var(--line)] bg-white focus-within:border-[var(--green)] focus-within:ring-2 focus-within:ring-emerald-100">
        <span className="grid min-h-11 place-items-center border-r border-[var(--line)] px-3 font-bold text-[var(--muted)]">
          ₹
        </span>
        <input
          className="min-w-0 flex-1 px-3 outline-none"
          type="number"
          min="0"
          step="0.01"
          placeholder="Do not change"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </span>
    </label>
  );
  return (
    <Modal wide onClose={() => !saving && onClose()}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[var(--green)]">
              Mass update
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">
              Update {count} selected {count === 1 ? "product" : "products"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Update wholesale settings for the selected products. Only
              completed fields will change. Inventory, stock, batch history,
              retail pricing and other product details remain untouched.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            <X />
          </button>
        </div>
        <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5">
          <div>
            <strong className="text-base">Wholesale</strong>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Do not change preserves each selected product&apos;s existing value.
            </p>
          </div>

          <div className="mt-5 space-y-5">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-extrabold">Wholesale Pricing</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Wholesale Status</span>
                  <select
                    className="field"
                    value={wholesaleStatus}
                    onChange={(event) => setWholesaleStatus(event.target.value)}
                  >
                    <option value="">Do not change</option>
                    <option value="ENABLED">Enable Wholesale</option>
                    <option value="DISABLED">Disable Wholesale</option>
                  </select>
                </label>
                <label>
                  <span className="label">Wholesale Pricing Method</span>
                  <select
                    className="field"
                    value={pricingMethod}
                    onChange={(event) => setPricingMethod(event.target.value)}
                  >
                    <option value="">Do not change</option>
                    <option value="FIXED">Fixed Wholesale Price</option>
                    <option value="DISCOUNT_FROM_RETAIL">
                      Discount from Retail %
                    </option>
                  </select>
                </label>
                {pricingMethod === "FIXED" &&
                  currencyField(
                    "Wholesale Price",
                    wholesalePrice,
                    setWholesalePrice,
                  )}
                {pricingMethod === "DISCOUNT_FROM_RETAIL" && (
                  <label>
                    <span className="label">
                      Wholesale Discount from Retail %
                    </span>
                    <span className="flex overflow-hidden rounded-xl border border-[var(--line)] bg-white focus-within:border-[var(--green)] focus-within:ring-2 focus-within:ring-emerald-100">
                      <input
                        className="min-w-0 flex-1 px-3 outline-none"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="Example: 10"
                        value={wholesaleDiscount}
                        onChange={(event) =>
                          setWholesaleDiscount(event.target.value)
                        }
                      />
                      <span className="grid min-h-11 place-items-center border-l border-[var(--line)] px-3 font-bold text-[var(--muted)]">
                        %
                      </span>
                    </span>
                  </label>
                )}
                <label>
                  <span className="label">Minimum Wholesale Qty</span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Do not change"
                    value={wholesaleMinQty}
                    onChange={(event) => setWholesaleMinQty(event.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Wholesale Unit</span>
                  <select
                    className="field"
                    value={wholesaleSaleUnit}
                    onChange={(event) =>
                      setWholesaleSaleUnit(event.target.value)
                    }
                  >
                    <option value="">Do not change</option>
                    <option value="PACKAGE">Package</option>
                    <option value="WHOLESALE_PACK">Wholesale Pack</option>
                    <option value="LOOSE_UNIT">Loose Unit</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-extrabold">Wholesale Pack</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Wholesale Pack</span>
                  <select
                    className="field"
                    value={wholesalePack}
                    onChange={(event) => setWholesalePack(event.target.value)}
                  >
                    <option value="">Do not change</option>
                    <option value="ENABLED">Enable</option>
                    <option value="DISABLED">Disable</option>
                  </select>
                </label>
                <label>
                  <span className="label">Packages per Wholesale Pack</span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Example: 12"
                    value={unitsPerWholesalePack}
                    onChange={(event) =>
                      setUnitsPerWholesalePack(event.target.value)
                    }
                  />
                </label>
                {wholesalePack !== "DISABLED" &&
                  currencyField(
                    "Wholesale Pack Price",
                    wholesalePackPrice,
                    setWholesalePackPrice,
                  )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-extrabold">Loose Wholesale</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Wholesale Loose Sale</span>
                  <select
                    className="field"
                    value={wholesaleLoose}
                    onChange={(event) => setWholesaleLoose(event.target.value)}
                  >
                    <option value="">Do not change</option>
                    <option value="ENABLED">Enable</option>
                    <option value="DISABLED">Disable</option>
                  </select>
                </label>
                {wholesaleLoose !== "DISABLED" &&
                  currencyField(
                    "Wholesale Loose Price",
                    wholesaleLoosePrice,
                    setWholesaleLoosePrice,
                  )}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Price per tablet, gram, ml, piece, or the product&apos;s configured
                loose unit.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-extrabold">Schemes</h3>
              <label className="mt-4 block sm:max-w-[calc(50%-0.5rem)]">
                <span className="label">Free Quantity Scheme</span>
                <select
                  className="field"
                  value={freeScheme}
                  onChange={(event) => setFreeScheme(event.target.value)}
                >
                  <option value="">Do not change</option>
                  <option value="ENABLED">Enable</option>
                  <option value="DISABLED">Disable</option>
                </select>
              </label>
            </div>
          </div>
        </section>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="loading-shimmer-icon" size={17} />
            ) : (
              <Check size={17} />
            )}
            {saving ? "Updating…" : "Update wholesale settings"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProductActions({ product, actions }) {
  const item =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold outline-none hover:bg-[#f3f6f1] focus:bg-[#f3f6f1]";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="btn !min-h-9 !p-2"
          aria-label={`Actions for ${product.name}`}
        >
          <MoreVertical size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[90] min-w-56 rounded-xl border bg-white p-1.5 shadow-xl"
        >
          <DropdownMenu.Item className={item} onSelect={actions.edit}>
            <Edit3 size={16} />
            Edit product
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.editPricing}>
            <FileSpreadsheet size={16} />
            Edit pricing
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.add}>
            <Boxes size={16} />
            Add stock
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.adjust}>
            <SlidersHorizontal size={16} />
            Stock adjustment
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.viewBatches}>
            <Layers3 size={16} />
            Manage batches
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.viewStockHistory}>
            <History size={16} />
            View stock history
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.viewSalesHistory}>
            <FileSpreadsheet size={16} />
            View sales history
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.duplicate}>
            <Package size={16} />
            Duplicate product
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.visibility}>
            {product.visibleInSales === false ? (
              <Eye size={16} />
            ) : (
              <EyeOff size={16} />
            )}{" "}
            {product.visibleInSales === false ? "Show in POS" : "Hide from POS"}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={actions.status}>
            <Archive size={16} />
            {product.active === false ? "Activate" : "Deactivate"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--line)]" />
          <DropdownMenu.Item
            className={`${item} text-red-700 hover:bg-red-50 focus:bg-red-50`}
            onSelect={actions.remove}
          >
            <Trash2 size={16} />
            Delete product
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProductRow({
  product,
  onOpen,
  onSelect,
  selected,
  actions,
  mobile = false,
}) {
  const countBased =
      product.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED,
    hasStock =
      product.stock.hasStock ??
      (product.stock.sealedPackages > 0 || product.stock.openQuantity > 0);
  const stockTone = !hasStock ? "red" : product.lowStock ? "amber" : "green";
  if (mobile)
    return (
      <article className="card p-4" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--green)]"
              checked={selected}
              aria-label={`Select ${product.name}`}
              onClick={(event) => event.stopPropagation()}
              onChange={onSelect}
            />
            <div className="min-w-0">
              <h3 className="font-extrabold">{product.name}</h3>
              <p className="text-xs text-[var(--muted)]">
                {product.sku} · {product.categoryId?.name || "Uncategorized"}
              </p>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ProductActions product={product} actions={actions} />
          </div>
        </div>
        <div className="mt-4">
          <strong>{hasStock ? product.stockLabel : "Out of stock"}</strong>
          {!countBased && (
            <p className="text-xs text-[var(--muted)]">
              {number(product.stock.totalBaseQuantity)} {product.baseUnit} total
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {product.allowPackageSale && <Pill>Package</Pill>}
          {product.allowLooseSale && <Pill>Loose</Pill>}
          {countBased && <Pill tone="blue">Count Based</Pill>}
          {product.allowMixture && <Pill>Mix</Pill>}
          <Pill tone={stockTone}>
            {product.lowStock
              ? "Low stock"
              : hasStock
                ? "In stock"
                : "Out of stock"}
          </Pill>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <strong>
            {money(product.packageSellingPrice)} / {product.packageType}
          </strong>
          {product.allowLooseSale && (
            <p className="text-xs text-[var(--muted)]">
              {money(product.loosePricePerUnit)} /{" "}
              {countBased ? product.looseUnit : product.baseUnit}
            </p>
          )}
          <Pill tone={product.active !== false ? "green" : "gray"}>
            {product.active !== false ? "Active" : "Inactive"}
          </Pill>
        </div>
      </article>
    );
  return (
    <tr className="cursor-pointer hover:bg-[#fbfcfa]" onClick={onOpen}>
      <td onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          className="size-4 accent-[var(--green)]"
          checked={selected}
          aria-label={`Select ${product.name}`}
          onChange={onSelect}
        />
      </td>
      <td>
        <strong>{product.name}</strong>
        <p className="text-xs text-[var(--muted)]">
          {product.sku}
          {product.barcode ? ` · ${product.barcode}` : ""}
        </p>
      </td>
      <td>{product.categoryId?.name || "Uncategorized"}</td>
      <td>
        <strong>{hasStock ? product.stockLabel : "Out of stock"}</strong>
        {!countBased && (
          <p className="text-xs text-[var(--muted)]">
            {number(product.stock.totalBaseQuantity)} {product.baseUnit} total
          </p>
        )}
        {product.lowStock && <Pill tone="amber">Low stock</Pill>}
        {product.stock.sealedPackages === 0 &&
          product.stock.openQuantity > 0 && (
            <Pill tone="blue">Opened stock only</Pill>
          )}
        {product.expiringSoon && (
          <p className="mt-1 text-xs font-bold text-amber-700">
            Expires soon · {date(product.nearestExpiry)}
          </p>
        )}
      </td>
      <td>
        <strong>
          {number(product.packageSize)} {product.baseUnit}
        </strong>
        <p className="text-xs text-[var(--muted)]">{product.packageType}</p>
        {product.activeBatchCount > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {product.activeBatchCount} active{" "}
            {product.activeBatchCount === 1 ? "batch" : "batches"}
          </p>
        )}
      </td>
      <td>
        <strong>
          {money(product.packageSellingPrice)} / {product.packageType}
        </strong>
        {product.allowLooseSale && (
          <p className="text-xs text-[var(--muted)]">
            {money(product.loosePricePerUnit)} /{" "}
            {countBased ? product.looseUnit : product.baseUnit}
          </p>
        )}
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {product.allowPackageSale && <Pill>Package</Pill>}
          {product.allowLooseSale && <Pill tone="blue">Loose</Pill>}
          {countBased && <Pill tone="amber">Count Based</Pill>}
          {product.allowMixture && <Pill tone="amber">Mix</Pill>}
        </div>
      </td>
      <td>
        <Pill tone={product.active !== false ? "green" : "gray"}>
          {product.active !== false ? "Active" : "Inactive"}
        </Pill>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {product.visibleInSales !== false
            ? "Visible in POS"
            : "Hidden from POS"}
        </p>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <ProductActions product={product} actions={actions} />
      </td>
    </tr>
  );
}

export default function ProductCatalogue() {
  const pageSize = 20;
  const confirmAction = useConfirm();
  const [products, setProducts] = useState([]),
    [categories, setCategories] = useState([]),
    [suppliers, setSuppliers] = useState([]),
    [settings, setSettings] = useState(null),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [category, setCategory] = useState("ALL"),
    [stockFilter, setStockFilter] = useState([]),
    [capability, setCapability] = useState([]),
    [visibility, setVisibility] = useState([]),
    [more, setMore] = useState([]);
  const [editor, setEditor] = useState(null),
    [editorMode, setEditorMode] = useState(null),
    [drawer, setDrawer] = useState(null),
    [adjustment, setAdjustment] = useState(null),
    [adjustDirection, setAdjustDirection] = useState("INCREASE"),
    [importOpen, setImportOpen] = useState(false),
    [selected, setSelected] = useState(() => new Set()),
    [bulkUpdateOpen, setBulkUpdateOpen] = useState(false),
    [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    const barcode = new URLSearchParams(window.location.search).get("newBarcode")?.trim();
    if (!barcode) return;
    const timer = window.setTimeout(() => {
      setEditorMode(null);
      setEditor({ barcode });
    }, 0);
    window.history.replaceState({}, "", window.location.pathname);
    return () => window.clearTimeout(timer);
  }, []);
  function replaceProducts(rows) {
    setProducts(rows);
    setPage(1);
    const available = new Set(rows.map((product) => String(product._id)));
    setSelected(
      (current) => new Set([...current].filter((id) => available.has(id))),
    );
  }
  function openEditor(product, mode = null) {
    setEditorMode(mode);
    setEditor(product);
  }
  function openDrawer(productId, initialSection = null) {
    setDrawer({ productId, initialSection });
  }
  async function load(search = query) {
    setLoading(true);
    try {
      replaceProducts(
        await api(
          `/api/products${search ? `?q=${encodeURIComponent(search)}` : ""}`,
        ),
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const rows = await api(
          `/api/products${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        );
        if (active) replaceProducts(rows);
      } catch (error) {
        if (active) toast.error(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    api("/api/categories")
      .then(setCategories)
      .catch((e) => toast.error(e.message));
    api("/api/suppliers")
      .then(setSuppliers)
      .catch(() => {});
    api("/api/settings")
      .then(setSettings)
      .catch(() => {});
  }, []);
  const filtered = useMemo(
    () =>
      products.filter((product) => {
        if (category !== "ALL" && String(product.categoryId?._id) !== category)
          return false;
        if (
          stockFilter.length &&
          !stockFilter.some(
            (value) =>
              ({
                IN:
                  product.stock.hasStock ?? product.stock.totalBaseQuantity > 0,
                LOW: product.lowStock,
                OUT: !(
                  product.stock.hasStock ?? product.stock.totalBaseQuantity > 0
                ),
                OPEN: product.stock.openQuantity > 0,
              })[value],
          )
        )
          return false;
        if (
          capability.length &&
          !capability.some(
            (value) =>
              ({
                PACKAGE: product.allowPackageSale,
                LOOSE: product.allowLooseSale,
                MIX: product.allowMixture,
              })[value],
          )
        )
          return false;
        if (
          visibility.length &&
          !visibility.some(
            (value) =>
              ({
                VISIBLE: product.visibleInSales !== false,
                HIDDEN: product.visibleInSales === false,
              })[value],
          )
        )
          return false;
        if (
          more.length &&
          !more.some(
            (value) =>
              ({
                ACTIVE: product.active !== false,
                INACTIVE: product.active === false,
                EXPIRING: product.expiringSoon,
                EXPIRED: product.expired,
                MULTI: product.activeBatchCount >= 2,
              })[value],
          )
        )
          return false;
        return true;
      }),
    [products, category, stockFilter, capability, visibility, more],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedIds = [...selected];
  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((product) => selected.has(String(product._id)));
  const allPageSelected =
    paginated.length > 0 &&
    paginated.every((product) => selected.has(String(product._id)));
  function toggleProduct(productId) {
    const id = String(productId);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      else toast.error("Select no more than 200 products at a time.");
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const product of filtered) next.delete(String(product._id));
      } else {
        for (const product of filtered) {
          if (next.has(String(product._id))) continue;
          if (next.size >= 200) break;
          next.add(String(product._id));
        }
        if (filtered.some((product) => !next.has(String(product._id))))
          toast.error("Only the first 200 products can be selected at once.");
      }
      return next;
    });
  }
  function toggleCurrentPage() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const product of paginated) next.delete(String(product._id));
      } else {
        for (const product of paginated) {
          if (next.has(String(product._id))) continue;
          if (next.size >= 200) break;
          next.add(String(product._id));
        }
        if (paginated.some((product) => !next.has(String(product._id))))
          toast.error("Select no more than 200 products at a time.");
      }
      return next;
    });
  }
  async function applyBulkUpdate(changes) {
    if (
      !(await confirmAction({
        title: `Update wholesale settings for ${selected.size} selected ${selected.size === 1 ? "product" : "products"}?`,
        description:
          "Only the completed wholesale fields will change. Other product and inventory details will remain untouched.",
        confirmText: "Update wholesale settings",
        cancelText: "Cancel",
      }))
    )
      return;
    try {
      const result = await api("/api/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, changes }),
      });
      toast.success(`${result.updated} products updated successfully.`);
      setBulkUpdateOpen(false);
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function bulkDelete() {
    if (
      !(await confirmAction({
        title: `Delete ${selected.size} selected products?`,
        description:
          "Unused products will be permanently deleted. Products with stock or transaction history will be deactivated and hidden from POS to preserve records.",
        confirmText: "Delete selected",
        cancelText: "Cancel",
        variant: "danger",
      }))
    )
      return;
    setBulkBusy(true);
    try {
      const result = await api("/api/products/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      toast.success(
        `${result.deleted} deleted; ${result.deactivated} deactivated to preserve stock and history.`,
      );
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBulkBusy(false);
    }
  }
  const metrics = {
    total: products.length,
    low: products.filter((p) => p.lowStock).length,
    opened: products.filter((p) => p.stock.openQuantity > 0).length,
    expiring: products.filter((p) => p.expiringSoon).length,
    inactive: products.filter((p) => p.active === false).length,
  };
  const reset = () => {
    setPage(1);
    setCategory("ALL");
    setStockFilter([]);
    setCapability([]);
    setVisibility([]);
    setMore([]);
    setQuery("");
  };
  async function patchProduct(product, changes, message) {
    try {
      await api("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product._id, ...changes }),
      });
      toast.success(message);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function remove(product) {
    if (
      !(await confirmAction({
        title: `Delete ${product.name}?`,
        description: "This action cannot be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
        variant: "danger",
      }))
    )
      return;
    try {
      await api(`/api/products?id=${product._id}`, { method: "DELETE" });
      toast.success("Product deleted successfully.");
      load();
    } catch (error) {
      if (
        error.status === 409 &&
        (await confirmAction({
          title: "Deactivate this product instead?",
          description: error.message,
          confirmText: "Deactivate",
          cancelText: "Cancel",
          variant: "warning",
        }))
      )
        await patchProduct(
          product,
          { active: false, visibleInSales: false },
          "Product deactivated.",
        );
      else toast.error(error.message);
    }
  }
  const actions = (product) => ({
    edit: () => openEditor(product),
    editPricing: () => openEditor(product, "pricing"),
    viewBatches: () => openDrawer(product._id, "batches"),
    viewStockHistory: () => openDrawer(product._id, "stockHistory"),
    viewSalesHistory: () => openDrawer(product._id, "salesHistory"),
    add: () => {
      setAdjustDirection("INCREASE");
      setAdjustment(product);
    },
    adjust: () => {
      setAdjustDirection("INCREASE");
      setAdjustment(product);
    },
    duplicate: () =>
      openEditor({
        ...product,
        _id: undefined,
        name: `${product.name} Copy`,
        sku: "",
        barcode: "",
        openingPackages: "",
        openingStockPacks: "",
        openingQuantity: "",
      }),
    visibility: () =>
      patchProduct(
        product,
        { visibleInSales: product.visibleInSales === false },
        product.visibleInSales === false
          ? "Product is visible in POS."
          : "Product hidden from POS.",
      ),
    status: () =>
      patchProduct(
        product,
        { active: product.active === false },
        product.active === false
          ? "Product activated."
          : "Product deactivated.",
      ),
    remove: () => remove(product),
  });
  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[var(--green)]">
            Inventory catalogue
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Products</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Manage products, inventory configuration, pricing, batches and POS
            visibility.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={17} />
            Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => openEditor({})}>
            <Plus size={17} />
            Add product
          </button>
        </div>
      </header>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total products", metrics.total, Package],
          ["Low stock", metrics.low, AlertTriangle],
          ["Opened stock", metrics.opened, Boxes],
          ["Expiring soon", metrics.expiring, Clock3],
          ["Inactive", metrics.inactive, Archive],
        ].map(([label, value, Icon]) => (
          <div className="card p-4" key={label}>
            <div className="flex items-start justify-between">
              <span>
                <small className="uppercase text-[var(--muted)]">{label}</small>
                <strong className="mt-1 block text-2xl">{value}</strong>
              </span>
              <Icon size={19} className="text-[var(--green)]" />
            </div>
          </div>
        ))}
      </div>
      <section className="card mb-5 p-4">
        <div className="relative">
          <Search
            className="absolute left-4 top-3.5 text-[var(--muted)]"
            size={18}
          />
          <input
            className="field !pl-11"
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            placeholder="Search products by name, SKU, barcode or brand…"
          />
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-extrabold ${category === "ALL" ? "bg-[var(--green)] text-white" : ""}`}
            onClick={() => {
              setPage(1);
              setCategory("ALL");
            }}
          >
            All
          </button>
          {categories
            .filter((item) => item.active !== false)
            .map((item) => (
              <button
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-extrabold ${category === item._id ? "bg-[var(--green)] text-white" : ""}`}
                key={item._id}
                onClick={() => {
                  setPage(1);
                  setCategory(item._id);
                }}
              >
                {item.name}
              </button>
            ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <MultiSelectFilter
            triggerClassName="btn !min-h-10 min-w-40"
            openTriggerClassName="border-[var(--green)] ring-2 ring-emerald-100"
            clearLabel="Any stock status"
            label="Stock status"
            values={stockFilter}
            options={[
              { value: "IN", label: "In stock" },
              { value: "LOW", label: "Low stock" },
              { value: "OUT", label: "Out of stock" },
              { value: "OPEN", label: "Opened stock" },
            ]}
            onChange={(values) => {
              setPage(1);
              setStockFilter(values);
            }}
          />
          <MultiSelectFilter
            triggerClassName="btn !min-h-10 min-w-40"
            openTriggerClassName="border-[var(--green)] ring-2 ring-emerald-100"
            clearLabel="Any capability"
            label="Capabilities"
            values={capability}
            options={[
              { value: "PACKAGE", label: "Package sale" },
              { value: "LOOSE", label: "Loose sale" },
              { value: "MIX", label: "Custom mix" },
            ]}
            onChange={(values) => {
              setPage(1);
              setCapability(values);
            }}
          />
          <MultiSelectFilter
            triggerClassName="btn !min-h-10 min-w-40"
            openTriggerClassName="border-[var(--green)] ring-2 ring-emerald-100"
            clearLabel="Any POS status"
            label="POS status"
            values={visibility}
            options={[
              { value: "VISIBLE", label: "Visible" },
              { value: "HIDDEN", label: "Hidden" },
            ]}
            onChange={(values) => {
              setPage(1);
              setVisibility(values);
            }}
          />
          <MultiSelectFilter
            triggerClassName="btn !min-h-10 min-w-40"
            openTriggerClassName="border-[var(--green)] ring-2 ring-emerald-100"
            clearLabel="Any additional filter"
            label="More filters"
            values={more}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "EXPIRING", label: "Expiring soon" },
              { value: "EXPIRED", label: "Expired" },
              { value: "MULTI", label: "Multiple batches" },
            ]}
            onChange={(values) => {
              setPage(1);
              setMore(values);
            }}
          />
          <button className="btn !min-h-10" onClick={reset}>
            <X size={15} />
            Reset filters
          </button>
          <span className="ml-auto self-center text-sm font-extrabold">
            {filtered.length
              ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length} Products`
              : "0 Products"}
          </span>
        </div>
      </section>
      {selected.size > 0 && (
        <section className="card sticky top-20 z-30 mb-5 flex flex-col gap-3 border-[var(--green)] bg-[#f4faf5] p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong>
              {selected.size} {selected.size === 1 ? "product" : "products"}{" "}
              selected
            </strong>
            <p className="text-xs text-[var(--muted)]">
              Mass actions apply only to the selected products.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn !min-h-9"
              onClick={toggleAllFiltered}
              disabled={bulkBusy}
            >
              <Check size={15} />
              {allFilteredSelected
                ? "Unselect filtered"
                : "Select all filtered"}
            </button>
            <button
              className="btn !min-h-9"
              onClick={() => setBulkUpdateOpen(true)}
              disabled={bulkBusy}
            >
              <Edit3 size={15} /> Mass update
            </button>
            <button
              className="btn !min-h-9 !border-red-200 !text-red-700"
              onClick={bulkDelete}
              disabled={bulkBusy}
            >
              {bulkBusy ? (
                <LoaderCircle className="loading-shimmer-icon" size={15} />
              ) : (
                <Trash2 size={15} />
              )}
              {bulkBusy ? "Processing…" : "Mass delete"}
            </button>
            <button
              className="btn !min-h-9"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
            >
              <X size={15} /> Clear
            </button>
          </div>
        </section>
      )}
      {loading ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="h-14 loading-shimmer rounded-xl bg-[#edf1ec]"
              key={index}
            />
          ))}
        </div>
      ) : filtered.length ? (
        <>
          <div className="products-table-scroll hidden card table-wrap md:block">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--green)]"
                      checked={allPageSelected}
                      aria-label="Select all products on this page"
                      onChange={toggleCurrentPage}
                    />
                  </th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Inventory</th>
                  <th>Package</th>
                  <th>Pricing</th>
                  <th>Capabilities</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((product) => (
                  <ProductRow
                    key={product._id}
                    product={product}
                    selected={selected.has(String(product._id))}
                    onSelect={() => toggleProduct(product._id)}
                    onOpen={() => openDrawer(product._id)}
                    actions={actions(product)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {paginated.map((product) => (
              <ProductRow
                mobile
                key={product._id}
                product={product}
                selected={selected.has(String(product._id))}
                onSelect={() => toggleProduct(product._id)}
                onOpen={() => openDrawer(product._id)}
                actions={actions(product)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <nav
              className="card mt-4 flex items-center justify-between gap-3 p-3"
              aria-label="Product pagination"
            >
              <button
                type="button"
                className="btn !min-h-9"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="text-sm font-extrabold">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn !min-h-9"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="card grid min-h-72 place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]">
              <Package />
            </span>
            <h2 className="mt-4 text-lg font-extrabold">
              {products.length ? "No products found" : "No products yet"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {products.length
                ? "Try another search or change your filters."
                : "Add your first Ayurvedic product or import your catalogue using CSV."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {products.length ? (
                <button className="btn" onClick={reset}>
                  Clear filters
                </button>
              ) : (
                <>
                  <button className="btn" onClick={() => setImportOpen(true)}>
                    Import CSV
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => openEditor({})}
                  >
                    <Plus size={16} />
                    Add product
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {editor && (
        <ProductEditor
          product={Object.keys(editor).length ? editor : null}
          mode={editorMode}
          products={products}
          categories={categories}
          suppliers={suppliers}
          settings={settings}
          onCategory={(item) =>
            setCategories((current) =>
              [...current, item].sort((a, b) => a.name.localeCompare(b.name)),
            )
          }
          onClose={() => {
            setEditor(null);
            setEditorMode(null);
          }}
          onSaved={() => {
            setEditor(null);
            setEditorMode(null);
            load();
          }}
        />
      )}
      {drawer && (
        <ProductDrawer
          productId={drawer.productId}
          initialSection={drawer.initialSection}
          onClose={() => setDrawer(null)}
          onEdit={(product) => {
            setDrawer(null);
            openEditor(product);
          }}
          onAdjust={(product) => {
            setDrawer(null);
            setAdjustment(product);
          }}
        />
      )}
      {adjustment && (
        <AdjustmentModal
          product={adjustment}
          defaultDirection={adjustDirection}
          onClose={() => setAdjustment(null)}
          onSaved={() => {
            setAdjustment(null);
            load();
          }}
        />
      )}
      {importOpen && (
        <ImportWizard
          categories={categories}
          onClose={() => setImportOpen(false)}
          onImported={() => load()}
        />
      )}
      {bulkUpdateOpen && (
        <BulkUpdateModal
          count={selected.size}
          onClose={() => setBulkUpdateOpen(false)}
          onApply={applyBulkUpdate}
        />
      )}
    </div>
  );
}
