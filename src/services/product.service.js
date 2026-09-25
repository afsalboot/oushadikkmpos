import mongoose from "mongoose";
import { Category, InventoryBatch, Product, Purchase, Sale, Settings, StockTransaction, AuditLog } from "@/models";
import { calculatePhysicalStock, formatPhysicalStock, getLooseUnit, isCountBasedProduct, isLowStock } from "@/services/inventory.service";
import { normalizeProductInput, validateProductInput } from "@/lib/product-validation";

const daysFromNow = (date) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : null;

export async function validateProductIdentity({ sku, barcode, excludeId, session }) {
  const skuMatch = sku ? await Product.findOne({ sku, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("name sku").session(session || null).lean() : null;
  if (skuMatch) throw new Error(`SKU ${sku} already exists.`);
  const barcodeMatch = barcode ? await Product.findOne({ barcode, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("name barcode").session(session || null).lean() : null;
  if (barcodeMatch) throw new Error(`This barcode is already assigned to ${barcodeMatch.name}.`);
}

export async function validateProductCategory(categoryId, session) {
  if (!mongoose.isValidObjectId(categoryId) || !(await Category.exists({ _id: categoryId, active: true }).session(session || null))) throw new Error("Select a valid active category");
}

export function productFields(product) {
  const { openingPackages, openingStockPacks, openingIndividualPackages, openingQuantity, batchNumber, manufacturingDate, expiryDate, purchasePrice, supplierId, ...fields } = product;
  return fields;
}

async function validateProductTax(product) {
  const settings = await Settings.findOne({ key: "global" }).select("gst").lean();
  if (settings?.gst?.enabled && settings.gst.requireHsn && product.taxable !== false && !product.hsnCode) {
    throw new Error("HSN code is required for taxable products.");
  }
}

export async function createOpeningInventory({ product, input, actorId, session }) {
  const countBased=isCountBasedProduct(product);
  const total = countBased?input.openingQuantity:input.openingPackages * product.packageSize + input.openingQuantity;
  if (!(input.openingPackages > 0 || input.openingQuantity > 0)) return null;
  const batch = await InventoryBatch.create([{
    productId: product._id,
    batchNumber: input.batchNumber,
    manufacturingDate: input.manufacturingDate,
    expiryDate: input.expiryDate,
    packageSize: product.packageSize,
    sealedPackages: input.openingPackages,
    openQuantity: input.openingQuantity,
    purchasePrice: input.purchasePrice,
    sellingPrice: product.packageSellingPrice,
    supplierId: mongoose.isValidObjectId(input.supplierId) ? input.supplierId : undefined,
  }], { session, ordered: true });
  await StockTransaction.create([{
    productId: product._id,
    batchId: batch[0]._id,
    type: "OPENING_STOCK",
    baseQuantity: total,
    packageQuantity: input.openingPackages,
    looseQuantity: countBased?input.openingQuantity:0,
    looseUnit: getLooseUnit(product),
    unit: countBased?getLooseUnit(product):product.baseUnit,
    direction: "IN",
    previousStock: 0,
    newStock: total,
    referenceType: "PRODUCT",
    referenceId: product._id,
    reason: "Opening inventory",
    note: `Opening stock for ${product.sku}`,
    actorId,
  }], { session, ordered: true });
  return batch[0];
}

export async function createProduct(input, actorId, session) {
  const normalized = normalizeProductInput(input);
  const errors = validateProductInput(normalized);
  if (errors.length) throw new Error(errors.join(". "));
  await validateProductTax(normalized);
  await validateProductCategory(normalized.categoryId, session);
  await validateProductIdentity({ sku: normalized.sku, barcode: normalized.barcode, session });
  const [product] = await Product.create([productFields(normalized)], { session, ordered: true });
  await createOpeningInventory({ product, input: normalized, actorId, session });
  return product;
}

export async function updateProduct(id, input, actor) {
  const existing = await Product.findById(id);
  if (!existing) throw new Error("Product not found");
  const normalized = normalizeProductInput({ ...existing.toObject(), ...input, openingPackages: 0, openingQuantity: 0 });
  const errors = validateProductInput(normalized);
  if (errors.length) throw new Error(errors.join(". "));
  await validateProductTax(normalized);
  await validateProductCategory(normalized.categoryId);
  await validateProductIdentity({ sku: normalized.sku, barcode: normalized.barcode, excludeId: existing._id });
  const batches = await InventoryBatch.find({ productId: existing._id }).lean();
  const stock = calculatePhysicalStock(batches,existing);
  if (stock.hasStock && normalized.packageSize !== existing.packageSize) throw new Error("Package size cannot change while stock exists. Adjust stock to zero first.");
  const before=existing.toObject();
  existing.set(productFields(normalized));
  await mongoose.connection.transaction(async session=>{
    await existing.save({session});
    await AuditLog.create([{actorId:actor?.sub,action:"PRODUCT_UPDATED",module:"products",targetType:"Product",targetId:existing._id,description:"Updated product including tax configuration",metadata:{before,after:existing.toObject()}}],{session});
  });
  return existing;
}

export async function getProducts(filter = {}) {
  const products = await Product.find(filter).populate("categoryId", "name slug active").sort({ name: 1 }).lean();
  const productIds = products.map((product) => product._id);
  const batches = productIds.length ? await InventoryBatch.find({ productId: { $in: productIds } }).sort({ expiryDate: 1, createdAt: 1 }).lean() : [];
  const byProduct = new Map();
  for (const batch of batches) {
    const key = String(batch.productId);
    byProduct.set(key, [...(byProduct.get(key) || []), batch]);
  }
  return products.map((product) => {
    const productBatches = byProduct.get(String(product._id)) || [];
    const normalizedProduct={...product,packageUnit:product.packageUnit||product.baseUnit,looseUnit:product.looseUnit||(isCountBasedProduct(product)?"tablet":product.baseUnit)};
    const stock = calculatePhysicalStock(productBatches,normalizedProduct);
    const activeBatches = productBatches.filter((batch) => Number(batch.sealedPackages || 0)>0 || Number(batch.openQuantity || 0)>0);
    const expiringBatches = activeBatches.filter((batch) => { const days = daysFromNow(batch.expiryDate); return days !== null && days >= 0 && days <= 90; });
    const expiredBatches = activeBatches.filter((batch) => { const days = daysFromNow(batch.expiryDate); return days !== null && days < 0; });
    return {
      ...normalizedProduct,
      stock,
      stockLabel: formatPhysicalStock(stock, normalizedProduct),
      lowStock: isLowStock(stock, normalizedProduct),
      activeBatchCount: activeBatches.length,
      nearestExpiry: activeBatches.find((batch) => batch.expiryDate)?.expiryDate || null,
      expiringSoon: expiringBatches.length > 0,
      expired: expiredBatches.length > 0,
      batches: productBatches.map((batch)=>({ _id:batch._id, batchNumber:batch.batchNumber, sealedPackages:batch.sealedPackages, openQuantity:batch.openQuantity, expiryDate:batch.expiryDate })),
    };
  });
}

export async function getProductDetails(id) {
  const [product] = await getProducts({ _id: id });
  if (!product) throw new Error("Product not found");
  const [batches, history, salesHistory] = await Promise.all([
    InventoryBatch.find({ productId: id }).populate("supplierId", "name").sort({ expiryDate: 1, createdAt: -1 }).lean(),
    StockTransaction.find({ productId: id }).populate("actorId", "name").sort({ createdAt: -1 }).limit(100).lean(),
    Sale.find({ $or: [{ "items.productId": id }, { "items.ingredients.productId": id }] }).select("invoiceNumber customerSnapshot items total createdAt").sort({ createdAt: -1 }).limit(25).lean(),
  ]);
  return { ...product, batches, history, salesHistory };
}

export async function productHasHistory(productId) {
  const [sales, purchases, stockTransactions] = await Promise.all([
    Sale.exists({ $or: [{ "items.productId": productId }, { "items.ingredients.productId": productId }] }),
    Purchase.exists({ "items.productId": productId }),
    StockTransaction.exists({ productId }),
  ]);
  return Boolean(sales || purchases || stockTransactions);
}
