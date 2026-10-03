import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import {
  InventoryBatch,
  Product,
  AuditLog,
  Category,
  Settings,
} from "@/models";
import { WHOLESALE_UNITS } from "@/lib/wholesale";
import { productDuplicateKey } from "@/lib/product-duplicates";
import { parseBulkProductChanges, bulkProductUpdate } from "@/lib/product-bulk-fields";
import {
  MAX_BULK_PRODUCTS,
  classifyBulkDeletion,
  bulkProductSectionsTouched,
  missingWholesaleDefaults,
} from "@/lib/product-bulk";

function productIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => String(value || ""))
        .filter((value) => mongoose.isValidObjectId(value)),
    ),
  ].slice(0, MAX_BULK_PRODUCTS);
}

export async function PATCH(request) {
  let session;
  try {
    const actor = await requireSession("products.edit");
    await connectDb();
    const body = await request.json(), ids = productIds(body.ids);
    if (!ids.length || ids.length !== new Set(body.ids || []).size) return fail("Select valid products");
    if ((body.ids || []).length > MAX_BULK_PRODUCTS) return fail(`Bulk updates are limited to ${MAX_BULK_PRODUCTS} products`);
    let changes;
    try { changes = parseBulkProductChanges(body.changes || {}); } catch (error) { return fail(error.message); }
    session = await mongoose.startSession();
    let updated = 0;
    await session.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: ids } }).session(session).lean();
      if (products.length !== ids.length) throw new Error("Some selected products no longer exist. Refresh and try again.");
      if (changes.categoryId && (!mongoose.isValidObjectId(changes.categoryId) || !await Category.exists({ _id: changes.categoryId, active: true }).session(session))) throw new Error("Select an active category");
      if (changes.freeSchemeFreeProduct && (!mongoose.isValidObjectId(changes.freeSchemeFreeProduct) || !await Product.exists({ _id: changes.freeSchemeFreeProduct, active: true }).session(session))) throw new Error("Select an active free product");
      const settings = await Settings.findOne({ key: "global" }).session(session).lean();
      const stocked = await InventoryBatch.distinct("productId", { productId: { $in: ids }, $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }] }).session(session);
      const stockedIds = new Set(stocked.map(String));
      const wholesaleTouched = bulkProductSectionsTouched(changes).wholesale;
      const operations = products.map(product => {
        const defaults = wholesaleTouched ? missingWholesaleDefaults({ ...product, ...changes }, WHOLESALE_UNITS) : {};
        let update;
        try { update = bulkProductUpdate({ ...product, ...defaults }, changes, { hasStock: stockedIds.has(String(product._id)), requireHsn: settings?.gst?.enabled && settings.gst.requireHsn }); }
        catch (error) { throw new Error(`${product.name}: ${error.message}`); }
        const nextKey = productDuplicateKey({ ...product, ...update });
        if (nextKey !== productDuplicateKey(product)) update.duplicateKey = nextKey;
        return { updateOne: { filter: { _id: product._id }, update: { $set: { ...defaults, ...update } } } };
      });
      if (operations.some(operation => Object.hasOwn(operation.updateOne.update.$set, "duplicateKey"))) {
        const catalogue = await Product.find({}).session(session).lean();
        const changesById = new Map(operations.map(operation => [String(operation.updateOne.filter._id), operation.updateOne.update.$set]));
        const finalCatalogue = catalogue.map(product => ({ ...product, ...changesById.get(String(product._id)) }));
        for (const operation of operations) {
          const key = operation.updateOne.update.$set.duplicateKey;
          if (!key) continue;
          const match = finalCatalogue.find(product => String(product._id) !== String(operation.updateOne.filter._id) && productDuplicateKey(product) === key);
          if (match) throw Object.assign(new Error(`Bulk update would create a duplicate of ${match.name} (${match.sku}). Check duplicates before continuing.`), { status: 409 });
        }
      }
      await Product.bulkWrite(operations, { session });
      await AuditLog.insertMany(products.map((product, index) => ({ actorId: actor.sub, action: "PRODUCT_BULK_UPDATED", module: "products", targetType: "Product", targetId: product._id, description: "Bulk product update", metadata: { before: product, changes: operations[index].updateOne.update.$set } })), { session });
      updated = products.length;
    });
    return ok({ matched: updated, updated });
  } catch (error) {
    if (error.constructor === Error && !error.status) error.status = 422;
    return apiError(error);
  } finally { if (session) await session.endSession(); }
}

export async function DELETE(request) {
  let session;
  try {
    const actor = await requireSession("ADMIN");
    await connectDb();
    const body = await request.json();
    const ids = productIds(body.ids);
    if (!ids.length) return fail("Select at least one valid product");
    if ((body.ids || []).length > MAX_BULK_PRODUCTS)
      return fail(`Bulk deletion is limited to ${MAX_BULK_PRODUCTS} products`);
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const products = await Product.find({ _id: { $in: objectIds } })
      .select("name")
      .lean();
    if (!products.length) return fail("No selected products were found", 404);

    const { deleteIds } = classifyBulkDeletion(products);
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const snapshots = await Product.find({ _id: { $in: deleteIds } }).session(session).lean();
      const batches = await InventoryBatch.find({ productId: { $in: deleteIds } }).session(session).lean();
      await AuditLog.create(snapshots.map((product) => ({ actorId: actor.sub, action: "PRODUCT_DELETED", module: "products", targetType: "Product", targetId: product._id, description: `Deleted ${product.name}`, metadata: { product, batches: batches.filter((batch) => String(batch.productId) === String(product._id)) } })), { session, ordered: true });
      await InventoryBatch.deleteMany({ productId: { $in: deleteIds } }, { session });
      await Product.deleteMany({ _id: { $in: deleteIds } }, { session });
    });
    return ok({
      selected: products.length,
      deleted: deleteIds.length,
      deactivated: 0,
      missing: ids.length - products.length,
    });
  } catch (error) {
    return apiError(error);
  } finally {
    if (session) await session.endSession();
  }
}
