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

export function createProductImportDuplicateIndex(products = []) {
  const identities = new Map();
  const add = product => {
    const key = productImportIdentity(product);
    if (!key) return;
    const entries = identities.get(key) || [];
    entries.push({ sku: product.sku, manufacturer: textKey(product.manufacturer) });
    identities.set(key, entries);
  };
  products.forEach(add);
  return { add, find(product) {
    const brand = textKey(product.manufacturer);
    return identities.get(productImportIdentity(product))?.find(existing => !brand || existing.manufacturer === brand);
  } };
}
