import { BASE_UNITS, PACKAGE_TYPES, LOOSE_UNITS, normalizeProductInput } from "./product-validation.js";
import { WHOLESALE_UNITS, validateWholesaleProduct } from "./wholesale.js";

// Shared by the mass-edit form and API. Identity and batch stock are per-product.
export const BULK_PRODUCT_FIELDS = [
  ["categoryId", "Category", "Details", "category"],
  ["manufacturer", "Manufacturer", "Details", "text"],
  ["active", "Active", "Details", "boolean"],
  ["visibleInSales", "Visible in Sales", "Details", "boolean"],
  ["reorderLevel", "Reorder level", "Details", "number", 0],
  ["baseUnit", "Base unit", "Packaging", BASE_UNITS],
  ["packageUnit", "Package unit", "Packaging", BASE_UNITS],
  ["packageType", "Package type", "Packaging", PACKAGE_TYPES],
  ["packageSize", "Package size", "Packaging", "number", 0.001],
  ["stockPackType", "Stock pack", "Packaging", ["Box", "Carton"]],
  ["unitsPerStockPack", "Packages per stock pack", "Packaging", "integer", 1],
  ["packageSellingPrice", "Package selling price", "Pricing", "number", 0],
  ["allowPackageSale", "Package sale", "Pricing", "boolean"],
  ["allowLooseSale", "Loose sale", "Pricing", "boolean"],
  ["allowMixture", "Custom mix", "Pricing", "boolean"],
  ["loosePricingMethod", "Loose pricing method", "Pricing", ["PROPORTIONAL", "CUSTOM", "TIERS", "count_based"]],
  ["loosePricePerUnit", "Loose price per unit", "Pricing", "number", 0],
  ["looseUnit", "Loose selling unit", "Pricing", [...new Set([...BASE_UNITS, ...LOOSE_UNITS])]],
  ["looseConversionType", "Loose conversion", "Pricing", ["fixed", "count_on_open"]],
  ["unitsPerPackage", "Loose units per package", "Pricing", "integer", 1],
  ["priceTiers", "Loose price tiers (quantity:price | …)", "Pricing", "tiers"],
  ["hsnCode", "HSN code", "GST", "text"],
  ["taxable", "Taxable", "GST", "boolean"],
  ["useDefaultGstRate", "Use store GST rate", "GST", "boolean"],
  ["gstRate", "GST rate %", "GST", "number", 0, 100],
  ["gstPriceMode", "GST price mode", "GST", ["STORE", "INCLUSIVE", "EXCLUSIVE"]],
  ["batchTracking", "Batch tracking", "Tracking", "boolean"],
  ["expiryTracking", "Expiry tracking", "Tracking", "boolean"],
  ["wholesaleEnabled", "Wholesale", "Wholesale", "boolean"],
  ["wholesalePricingMethod", "Wholesale pricing", "Wholesale", ["FIXED", "DISCOUNT_FROM_RETAIL"]],
  ["wholesalePrice", "Wholesale price", "Wholesale", "number", 0],
  ["wholesaleDiscountPercent", "Wholesale discount %", "Wholesale", "number", 0, 100],
  ["wholesaleMinQty", "Minimum wholesale quantity", "Wholesale", "integer", 1],
  ["wholesaleSaleUnit", "Wholesale sale unit", "Wholesale", ["PACKAGE", "WHOLESALE_PACK", "LOOSE_UNIT"]],
  ["wholesaleUnit", "Wholesale pack type", "Wholesale", WHOLESALE_UNITS],
  ["wholesalePackEnabled", "Wholesale packs", "Wholesale", "boolean"],
  ["unitsPerWholesalePack", "Packages per wholesale pack", "Wholesale", "integer", 1],
  ["wholesalePackPrice", "Wholesale pack price", "Wholesale", "number", 0],
  ["wholesalePriceTiers", "Wholesale tiers (quantity:price | …)", "Wholesale", "tiers"],
  ["allowWholesaleLooseSale", "Wholesale loose sale", "Wholesale", "boolean"],
  ["wholesaleLoosePrice", "Wholesale loose price", "Wholesale", "number", 0],
  ["freeSchemeEnabled", "Free scheme", "Free scheme", "boolean"],
  ["freeSchemeType", "Free scheme type", "Free scheme", ["SAME_PRODUCT", "DIFFERENT_PRODUCT"]],
  ["freeSchemeBuyQty", "Buy quantity", "Free scheme", "integer", 1],
  ["freeSchemeFreeQty", "Free quantity", "Free scheme", "integer", 1],
  ["freeSchemeFreeProduct", "Free product", "Free scheme", "product"],
];
export function parseBulkProductChanges(changes) {
  const result = {};
  for (const [key, value] of Object.entries(changes)) {
    const field = BULK_PRODUCT_FIELDS.find(row => row[0] === key);
    if (!field) throw new Error(`Unsupported bulk field: ${key}`);
    const [, label, , type, min, max] = field;
    if (value == null || (typeof value === "string" && !value.trim())) throw new Error(`${label}: omit blank values to keep existing values`);
    if (Array.isArray(type)) {
      if (!type.includes(value)) throw new Error(`${label} is invalid`);
      result[key] = value;
    } else if (type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`${label} must be true or false`);
      result[key] = value;
    } else if (["number", "integer"].includes(type)) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || (max != null && number > max) || (type === "integer" && !Number.isSafeInteger(number))) throw new Error(`${label} is invalid`);
      result[key] = number;
    } else if (type === "tiers") {
      const tiers = Array.isArray(value) ? value : String(value).split("|").map(part => { const [quantity, price] = part.split(":"); return { quantity: Number(quantity), price: Number(price) }; });
      if (tiers.some(tier => !Number.isFinite(Number(tier.quantity)) || Number(tier.quantity) <= 0 || !Number.isFinite(Number(tier.price)) || Number(tier.price) < 0)) throw new Error(`${label} is invalid`);
      result[key] = tiers.map(tier => ({ quantity: Number(tier.quantity), price: Number(tier.price) }));
    } else {
      if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid`);
      result[key] = value.trim();
    }
  }
  if (!Object.keys(result).length) throw new Error("Choose at least one field to update");
  return result;
}
export function bulkProductUpdate(product, changes, { hasStock = false, requireHsn = false } = {}) {
  const update = { ...changes };
  if (changes.wholesalePackEnabled === true) {
    if (!("wholesaleUnit" in changes) && (!product.wholesaleUnit || product.wholesaleUnit === product.packageType)) update.wholesaleUnit = product.stockPackType || "Box";
    if (!("unitsPerWholesalePack" in changes) && Number(product.unitsPerWholesalePack || 1) <= 1 && Number(product.unitsPerStockPack || 1) > 1) update.unitsPerWholesalePack = Number(product.unitsPerStockPack);
  }
  const candidate = { ...product, ...update };
  const touched = group => BULK_PRODUCT_FIELDS.some(([key, , section]) => section === group && key in changes);
  if (hasStock && ["baseUnit", "packageUnit", "packageType", "packageSize", "loosePricingMethod", "looseUnit", "looseConversionType", "unitsPerPackage"].some(key => key in changes && String(changes[key]) !== String(product[key]))) throw new Error("Stock units and conversions cannot change while stock exists");
  if (touched("Pricing") || touched("Packaging")) {
    if (!candidate.allowPackageSale && !candidate.allowLooseSale) throw new Error("Enable package sale or loose sale");
    const normalized = normalizeProductInput(candidate);
    if (["packageSellingPrice", "packageSize", "loosePricingMethod"].some(key => key in changes)) update.loosePricePerUnit = normalized.loosePricePerUnit;
    if (candidate.allowLooseSale && candidate.loosePricingMethod === "TIERS" && !candidate.priceTiers?.length) throw new Error("Add loose price tiers");
    if (candidate.allowLooseSale && candidate.loosePricingMethod === "count_based") {
      if (!LOOSE_UNITS.includes(candidate.looseUnit) || !(normalized.loosePricePerUnit > 0)) throw new Error("Count-based loose sale needs a valid unit and positive price");
      if (!["fixed", "count_on_open"].includes(candidate.looseConversionType)) throw new Error("Choose the loose conversion type");
      if (candidate.looseConversionType === "fixed" && (!Number.isSafeInteger(Number(candidate.unitsPerPackage)) || Number(candidate.unitsPerPackage) <= 0)) throw new Error("Enter a positive whole number of units per package");
    }
  }
  if (touched("GST")) {
    if (candidate.hsnCode && !/^\d{2,8}$/.test(candidate.hsnCode)) throw new Error("HSN code must contain 2 to 8 digits");
    if (requireHsn && candidate.taxable !== false && !candidate.hsnCode) throw new Error("HSN code is required for taxable products");
    if ("taxable" in changes) { update.gstExempt = !changes.taxable; if (!changes.taxable) update.gstRate = 0; }
  }
  if (touched("Wholesale") || touched("Free scheme") || "allowLooseSale" in changes) {
    const errors = validateWholesaleProduct({ ...candidate, ...update });
    if (errors.length) throw new Error(errors.join(". "));
    if (candidate.freeSchemeEnabled && !candidate.wholesaleEnabled) throw new Error("Enable wholesale before enabling a free scheme");
    if (changes.freeSchemeType === "SAME_PRODUCT") update.freeSchemeFreeProduct = null;
  }
  return update;
}
