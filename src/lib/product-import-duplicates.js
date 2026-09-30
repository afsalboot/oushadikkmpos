const textKey = value => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function productImportIdentity(product) {
  const name = textKey(product.name);
  const category = String(product.categoryId?._id ?? product.categoryId ?? "");
  const unit = textKey(product.packageUnit || product.baseUnit);
  const type = textKey(product.packageType);
  const size = Number(product.packageSize);
  if (!name || !category || !unit || !type || !Number.isFinite(size) || size <= 0) return null;
  return JSON.stringify([name, category, unit, type, size]);
}

export const PRODUCT_DUPLICATE_OPTIONS = [["DETAILS", "Product details (name, category, pack size and brand)"], ["NAME", "Product name"], ["SKU", "SKU"], ["BARCODE", "Barcode"]];

export function createProductImportDuplicateIndex(products = [], matchBy = "DETAILS") {
  const keyFor = product => matchBy === "NAME" ? textKey(product.name) || null
    : matchBy === "SKU" ? textKey(product.sku) || null
    : matchBy === "BARCODE" ? String(product.barcode || "").trim() || null
    : productImportIdentity(product);
  const identities = new Map();
  const add = product => {
    const key = keyFor(product);
    if (!key) return;
    const entries = identities.get(key) || [];
    entries.push({ sku: product.sku, row: product.importRow, manufacturer: textKey(product.manufacturer) });
    identities.set(key, entries);
  };
  products.forEach(add);
  return { add, find(product) {
    const brand = textKey(product.manufacturer);
    return identities.get(keyFor(product))?.find(existing => matchBy !== "DETAILS" || !brand || existing.manufacturer === brand);
  } };
}
