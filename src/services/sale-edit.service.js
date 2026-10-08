import { saleEditProblem, saleStockReturns } from "@/lib/sale-edit";

export async function restoreSaleStock({ sale, InventoryBatch, StockTransaction, session, actorId }) {
  const rows = await StockTransaction.find({ referenceType: "SALE", referenceId: sale._id }).session(session).lean();
  const allocations = saleStockReturns(sale, rows);
  if (!allocations.length) {
    if (sale.items.every(item => item.itemSource === "external_purchase" || item.inventoryTracked === false)) return;
    throw new Error("Original stock allocations are missing. This sale cannot be edited safely.");
  }
  const returns = [];
  for (const allocation of allocations) {
    if (!Number.isFinite(allocation.sealedPackages) || allocation.sealedPackages < 0 || !Number.isFinite(allocation.openQuantity) || allocation.openQuantity < 0) throw new Error("Invalid original stock allocation");
    const batch = await InventoryBatch.findOne({ _id: allocation.batchId, productId: allocation.productId }).session(session);
    if (!batch) throw new Error("An original inventory batch is missing. This sale cannot be edited safely.");
    batch.sealedPackages += allocation.sealedPackages;
    batch.openQuantity += allocation.openQuantity;
    await batch.save({ session });
    returns.push({ productId: allocation.productId, batchId: allocation.batchId, type: "SALE_EDIT_RETURN",
      baseQuantity: allocation.sealedPackages * Number(batch.packageSize) + allocation.openQuantity,
      packageQuantity: allocation.sealedPackages, looseQuantity: allocation.openQuantity,
      direction: "IN", referenceType: "SALE", referenceId: sale._id, actorId,
      reason: `Stock reconciliation for edit ${Number(sale.editRevision || 0) + 1}` });
  }
  await StockTransaction.insertMany(returns, { session, ordered: true });
}

export async function loadSaleForEdit({ Sale, id, version, revision, session }) {
  const sale = await Sale.findById(id).session(session).lean();
  const problem = saleEditProblem(sale);
  if (problem) throw Object.assign(new Error(problem), { status: sale ? 422 : 404 });
  if (!version || new Date(sale.updatedAt).toISOString() !== version || !Number.isInteger(revision) || revision !== Number(sale.editRevision || 0)) throw Object.assign(new Error("This sale changed since you opened it. Reload the sale before editing."), { status: 409 });
  return sale;
}

export async function findSaleEditRetry({ AuditLog, requestKey, hash, actorId, session }) {
  const audit = await AuditLog.findOne({ action: "SALE_EDITED", "metadata.requestKey": requestKey }).session(session || null).lean();
  if (!audit) return null;
  if (String(audit.actorId) !== String(actorId) || audit.metadata.requestHash !== hash) throw Object.assign(new Error("This checkout key has already been used for a different request"), { status: 409 });
  return audit.metadata.after;
}

export async function saveSaleEdit({ Sale, AuditLog, original, fields, session, actorId, requestKey, hash }) {
  const revised = new Sale({ ...fields, _id: original._id,
    invoiceNumber: original.invoiceNumber, invoiceDate: original.invoiceDate,
    financialYear: original.financialYear, createdAt: original.createdAt,
    actorId: original.actorId, cashierSnapshot: original.cashierSnapshot,
    storeSnapshot: original.storeSnapshot, requestKey: original.requestKey, requestHash: original.requestHash,
    editRevision: Number(original.editRevision || 0) + 1, updatedAt: new Date() });
  await revised.validate();
  const after = revised.toObject();
  const { _id, __v, ...update } = after;
  // Only this audited transaction may revise a commercial sale. Ordinary model
  // writes retain their immutable invoice protections.
  await AuditLog.create([{ actorId, action: "SALE_EDITED", module: "sales", targetType: "Sale", targetId: _id,
    description: `Edited ${original.invoiceNumber}`, metadata: { requestKey, requestHash: hash, before: original, after } }], { session });
  const result = await Sale.collection.updateOne({ _id, updatedAt: original.updatedAt, editRevision: original.editRevision ?? { $exists: false } }, { $set: update }, { session });
  if (result.matchedCount !== 1) throw Object.assign(new Error("Sale changed during editing. Reload and try again."), { status: 409 });
  return after;
}
