import { productImportIdentity, productVariantIdentity } from "./product-import-duplicates.js";

const text = value => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Creation distinguishes batch/price variants; review and merge still compare product details.
export function productCreationKey(product) {
  const details = productDuplicateKey(product);
  return details ? JSON.stringify([details, productVariantIdentity(product)]) : null;
}

export function productDuplicateKey(product, matchBy = "DETAILS") {
  if (matchBy === "NAME") return text(product.name) || null;
  if (matchBy === "SKU") return text(product.sku) || null;
  if (matchBy === "BARCODE") return String(product.barcode || "").trim() || null;
  const identity = productImportIdentity(product);
  return identity ? JSON.stringify([identity, text(product.manufacturer)]) : null;
}

export function findProductDuplicateGroups(products, matchBy = "DETAILS") {
  const groups = new Map();
  for (const product of products) {
    const key = productDuplicateKey(product, matchBy);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

export function productMergeProblem(target, source) {
  if (text(target.manufacturer) !== text(source.manufacturer)) return "Brands must match before merging.";
  const fields = ["baseUnit", "packageType", "packageSize", "unitsPerStockPack", "unitsPerWholesalePack"];
  if (fields.some(field => text(target[field] ?? (field.startsWith("unitsPer") ? 1 : "")) !== text(source[field] ?? (field.startsWith("unitsPer") ? 1 : "")))) return "Package size, packaging, units and pack conversions must match before merging.";
  if (text(target.packageUnit || target.baseUnit) !== text(source.packageUnit || source.baseUnit)) return "Package units must match before merging.";
  const countBased = product => product.loosePricingMethod === "count_based";
  if (countBased(target) !== countBased(source)) return "Loose stock counting methods must match before merging.";
  if (target.allowLooseSale || source.allowLooseSale || countBased(target)) {
    if (text(target.looseUnit || target.baseUnit) !== text(source.looseUnit || source.baseUnit)) return "Loose units must match before merging.";
  }
  if (countBased(target) && (target.looseConversionType !== source.looseConversionType || Number(target.unitsPerPackage) !== Number(source.unitsPerPackage))) return "Count-based package conversions must match before merging.";
  return null;
}

export function resolvePurchaseItemBatch(item, entries, batches) {
  if (item.batchId) return item.batchId;
  const candidates = batches.filter(batch => String(batch.productId) === String(item.productId) && batch.batchNumber === item.batchNumber);
  const linked = candidates.filter(batch => entries.some(entry => String(entry.productId) === String(item.productId) && String(entry.batchId) === String(batch._id)));
  if (linked.length === 1) return linked[0]._id;
  if (!linked.length && candidates.length === 1) return candidates[0]._id;
  return null;
}
