export const MAX_BULK_PRODUCTS = 200;

export function bulkProductSectionsTouched(changes = {}) {
  const gst = [
    "taxable",
    "useDefaultGstRate",
    "gstRate",
    "gstPriceMode",
    "hsnCode",
  ].some((field) => changes[field] !== undefined);
  const wholesale =
    [
      "wholesaleEnabled",
      "wholesalePricingMethod",
      "wholesalePrice",
      "wholesaleDiscountPercent",
      "wholesaleMinQty",
      "wholesaleSaleUnit",
      "wholesaleUnit",
      "wholesalePackEnabled",
      "unitsPerWholesalePack",
      "wholesalePackPrice",
      "allowWholesaleLooseSale",
      "wholesaleLoosePrice",
      "freeSchemeEnabled",
      "freeSchemeType",
      "freeSchemeBuyQty",
      "freeSchemeFreeQty",
    ].some((field) => changes[field] !== undefined) ||
    (changes.pricePercent !== undefined && changes.adjustWholesale === true);
  return { gst, wholesale };
}

export function adjustedProductPrice(value, percentage) {
  const price = Number(value || 0);
  const adjustment = Number(percentage);
  if (!Number.isFinite(price) || !Number.isFinite(adjustment)) return null;
  return Math.max(0, Math.round(price * (1 + adjustment / 100) * 100) / 100);
}

export function missingWholesaleDefaults(product, allowedUnits) {
  if (!product?.wholesaleEnabled) return {};
  const defaults = {};
  if (!["FIXED", "DISCOUNT_FROM_RETAIL"].includes(product.wholesalePricingMethod))
    defaults.wholesalePricingMethod = "FIXED";
  if (
    !Number.isFinite(product.wholesaleDiscountPercent) ||
    product.wholesaleDiscountPercent < 0 ||
    product.wholesaleDiscountPercent > 100
  )
    defaults.wholesaleDiscountPercent = 0;
  if (!Number.isFinite(product.wholesalePrice))
    defaults.wholesalePrice = adjustedProductPrice(
      product.packageSellingPrice,
      0,
    );
  if (
    !Number.isInteger(product.wholesaleMinQty) ||
    product.wholesaleMinQty <= 0
  )
    defaults.wholesaleMinQty = 1;
  if (!allowedUnits.includes(product.wholesaleUnit))
    defaults.wholesaleUnit = allowedUnits.includes(product.packageType)
      ? product.packageType
      : "Box";
  if (!["PACKAGE", "WHOLESALE_PACK", "LOOSE_UNIT"].includes(product.wholesaleSaleUnit))
    defaults.wholesaleSaleUnit = "WHOLESALE_PACK";
  if (typeof product.wholesalePackEnabled !== "boolean")
    defaults.wholesalePackEnabled = true;
  if (
    !Number.isInteger(product.unitsPerWholesalePack) ||
    product.unitsPerWholesalePack <= 0
  )
    defaults.unitsPerWholesalePack = 1;
  if (!Array.isArray(product.wholesalePriceTiers))
    defaults.wholesalePriceTiers = [];
  if (typeof product.allowWholesaleLooseSale !== "boolean")
    defaults.allowWholesaleLooseSale = false;
  if (typeof product.freeSchemeEnabled !== "boolean")
    defaults.freeSchemeEnabled = false;
  if (!product.freeSchemeType) defaults.freeSchemeType = "SAME_PRODUCT";
  if (
    !Number.isInteger(product.freeSchemeBuyQty) ||
    product.freeSchemeBuyQty <= 0
  )
    defaults.freeSchemeBuyQty = 1;
  if (
    !Number.isInteger(product.freeSchemeFreeQty) ||
    product.freeSchemeFreeQty <= 0
  )
    defaults.freeSchemeFreeQty = 1;
  return defaults;
}

export function classifyBulkDeletion(products, preservedProductIds) {
  const preserve = new Set([...preservedProductIds].map(String));
  return {
    deactivateIds: products
      .filter((product) => preserve.has(String(product._id)))
      .map((product) => product._id),
    deleteIds: products
      .filter((product) => !preserve.has(String(product._id)))
      .map((product) => product._id),
  };
}
