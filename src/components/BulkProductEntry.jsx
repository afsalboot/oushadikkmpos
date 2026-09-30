"use client";
import { useState } from "react";
import { PRODUCT_TEMPLATE_FIELDS as PRODUCT_IMPORT_FIELDS } from "@/lib/product-import-fields";
import { BULK_PRODUCT_FIELDS } from "@/lib/product-bulk-fields";
import { BARCODE_TYPES } from "@/lib/barcode";

const snake = (value) =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const types = Object.fromEntries(
  BULK_PRODUCT_FIELDS.map(([key, , , type]) => [snake(key), type]),
);
Object.assign(types, {
  category: "category",
  package_price: "number",
  loose_price: "number",
  allow_mix: "boolean",
  pos_visible: "boolean",
  status: ["ACTIVE", "INACTIVE"],
  barcode_type: ["EAN13", "CODE128"],
  opening_stock_packs: "integer",
  opening_individual_packages: "integer",
  opening_packages: "integer",
  opening_quantity: "number",
  purchase_price: "number",
});
const group = (field) =>
  /^(wholesale|units_per_wholesale|allow_wholesale)/.test(field)
    ? "Wholesale"
    : field.startsWith("free_scheme")
      ? "Free scheme"
      : /^(hsn|gst|taxable|use_default)/.test(field)
        ? "GST"
        : /^(opening|batch|expiry|manufacturing|purchase_price|supplier)/.test(
              field,
            )
          ? "Opening stock and batches"
          : /^(loose|price_tiers|units_per_package)/.test(field)
            ? "Loose sale"
            : /^(package|base_unit|stock_pack|units_per_stock)/.test(field)
              ? "Packaging"
              : "Product details";
const label = (field) =>
  field === "sku"
    ? "SKU (optional)"
    : field
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());

types.barcode_type = BARCODE_TYPES;
export default function BulkProductEntry({
  categories,
  onReview,
  onCancel,
  initialRows,
}) {
  const [rows, setRows] = useState(initialRows?.length ? initialRows : [{}]);
  const change = (index, field, value) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Enter products, then review before importing. Blank optional fields use
        the Add Product defaults. SKU is optional and generated automatically
        when left blank. Entered SKUs must be unique.
      </p>
      {rows.map((row, index) => (
        <details
          key={index}
          open={rows.length === 1}
          className="rounded-xl border p-4"
        >
          <summary className="cursor-pointer font-bold">
            {index + 1}. {row.name || "New product"}
            {row.sku ? ` · ${row.sku}` : ""}
          </summary>
          <div className="mt-3 space-y-3">
            {[...new Set(PRODUCT_IMPORT_FIELDS.map(group))].map((section) => (
              <details
                key={section}
                open={section === "Product details"}
                className="rounded-lg border p-3"
              >
                <summary className="cursor-pointer text-sm font-bold">
                  {section}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {PRODUCT_IMPORT_FIELDS.filter(
                    (field) => group(field) === section,
                  ).map((field) => {
                    const type = types[field];
                    const options =
                      field === "category"
                        ? categories
                            .filter((category) => category.active !== false)
                            .map((category) => category.name)
                        : type === "boolean"
                          ? ["true", "false"]
                          : Array.isArray(type)
                            ? type
                            : null;
                    return (
                      <label key={field}>
                        <span className="label">{label(field)}</span>
                        {options ? (
                          <select
                            className="field"
                            value={row[field] ?? ""}
                            onChange={(event) =>
                              change(index, field, event.target.value)
                            }
                          >
                            <option value="">Use default / select</option>
                            {options.map((option) => (
                              <option key={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="field"
                            type={
                              field.endsWith("_date")
                                ? "date"
                                : ["number", "integer"].includes(type)
                                  ? "number"
                                  : "text"
                            }
                            min={0}
                            step={type === "integer" ? "1" : "any"}
                            value={row[field] ?? ""}
                            placeholder={
                              field === "free_scheme_free_product"
                                ? "Existing product SKU or ID"
                                : field.includes("tiers")
                                  ? "10:100|20:180"
                                  : ""
                            }
                            onChange={(event) =>
                              change(index, field, event.target.value)
                            }
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </details>
            ))}
            <button
              type="button"
              className="btn text-red-700"
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
            >
              Remove product
            </button>
          </div>
        </details>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={rows.length >= 200}
          onClick={() => setRows((current) => [...current, {}])}
        >
          Add another product
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Use CSV instead
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onReview(rows)}
        >
          Review {rows.length} products
        </button>
      </div>
    </div>
  );
}
