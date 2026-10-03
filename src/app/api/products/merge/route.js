import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Product, InventoryBatch, StockTransaction, Sale, Purchase, AuditLog } from "@/models";
import { productDuplicateKey, productMergeProblem, resolvePurchaseItemBatch } from "@/lib/product-duplicates";
import { PRODUCT_DUPLICATE_OPTIONS } from "@/lib/product-import-duplicates";

export async function POST(request) {
  try {
    const actor = await requireSession("ADMIN");
    await connectDb();
    const { targetId, sourceIds, matchBy = "DETAILS" } = await request.json();
    if (!mongoose.isValidObjectId(targetId) || !Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 100 || sourceIds.some(id => !mongoose.isValidObjectId(id)) || new Set([targetId, ...sourceIds].map(String)).size !== sourceIds.length + 1) return fail("Select a product to keep and distinct products to merge (maximum 100).");
    if (!PRODUCT_DUPLICATE_OPTIONS.some(([value]) => value === matchBy)) return fail("Invalid duplicate matching field");
    let result;
    await mongoose.connection.transaction(async session => {
      const target = await Product.findById(targetId).session(session).lean();
      const sources = await Product.find({ _id: { $in: sourceIds } }).session(session).lean();
      if (!target || sources.length !== sourceIds.length) throw Object.assign(new Error("Products changed or were already merged. Check duplicates again."), { status: 409 });
      const key = productDuplicateKey(target, matchBy);
      for (const source of sources) {
        if (!key || productDuplicateKey(source, matchBy) !== key) throw Object.assign(new Error("Selected products no longer match the duplicate check."), { status: 409 });
        const problem = productMergeProblem(target, source);
        if (problem) throw Object.assign(new Error(`${source.name}: ${problem}`), { status: 409 });
      }
      const ids = sources.map(product => product._id);
      const batches = await InventoryBatch.find({ productId: { $in: ids } }).session(session).lean();
      const allIds = [target._id, ...ids];
      const allBatches = await InventoryBatch.find({ productId: { $in: allIds } }).session(session).lean();
      const purchases = await Purchase.find({ purchaseStatus: "RECEIVED", "items.productId": { $in: allIds } }).session(session);
      for (const purchase of purchases) {
        const entries = await StockTransaction.find({ referenceType: "PURCHASE", referenceId: purchase._id, type: "PURCHASE" }).session(session).lean();
        for (const item of purchase.items) {
          if (!allIds.some(id => String(id) === String(item.productId))) continue;
          const batchId = resolvePurchaseItemBatch(item, entries, allBatches);
          if (!batchId) throw Object.assign(new Error(`Cannot safely identify the stock batch for ${purchase.purchaseNumber}. Resolve its batch history before merging.`), { status: 409 });
          item.batchId = batchId;
        }
        await purchase.save({ session });
      }
      // Keep batch IDs, quantities, costs and expiry dates; history snapshots remain unchanged.
      await InventoryBatch.updateMany({ productId: { $in: ids } }, { $set: { productId: target._id } }, { session });
      await StockTransaction.updateMany({ productId: { $in: ids } }, { $set: { productId: target._id } }, { session });
      await StockTransaction.updateMany({ referenceType: "PRODUCT", referenceId: { $in: ids } }, { $set: { referenceId: target._id } }, { session });
      for (const path of ["items.productId", "items.freeProductId"]) {
        const field = path.split(".")[1];
        await Sale.updateMany({ [path]: { $in: ids } }, { $set: { [`items.$[item].${field}`]: target._id } }, { session, arrayFilters: [{ [`item.${field}`]: { $in: ids } }] });
      }
      await Sale.updateMany({ "items.ingredients.productId": { $in: ids } }, { $set: { "items.$[mix].ingredients.$[ingredient].productId": target._id } }, { session, arrayFilters: [{ "mix.ingredients.productId": { $in: ids } }, { "ingredient.productId": { $in: ids } }] });
      await Purchase.updateMany({ "items.productId": { $in: ids } }, { $set: { "items.$[item].productId": target._id } }, { session, arrayFilters: [{ "item.productId": { $in: ids } }] });
      await Product.updateMany({ freeSchemeFreeProduct: { $in: ids } }, { $set: { freeSchemeFreeProduct: target._id } }, { session });
      // Write the survivor too, so concurrent merges involving it conflict and retry.
      await Product.updateOne({ _id: target._id }, { $set: { updatedAt: new Date() } }, { session });
      await AuditLog.create([{ actorId: actor.sub, action: "PRODUCTS_MERGED", module: "products", targetType: "Product", targetId: target._id, description: `Merged ${sources.length} duplicate products into ${target.name}`, metadata: { target, sources, batches, matchBy } }], { session });
      await Product.deleteMany({ _id: { $in: ids } }, { session });
      result = { targetId: String(target._id), merged: sources.length, movedBatches: batches.length };
    });
    return ok(result);
  } catch (error) { return apiError(error); }
}
