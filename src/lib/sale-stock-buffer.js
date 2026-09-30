// One transaction-local stock view for every line, including repeated products
// and mix ingredients. Never share this buffer between transaction retries.
export async function createSaleStockBuffer({ InventoryBatch, productIds, session, settings }) {
  const filter = {
    productId: { $in: [...new Set(productIds.map(String))] },
    $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }],
  };
  if (settings?.batchExpiry?.blockExpiredSales) filter.$and = [{ $or: [
    { expiryDate: { $exists: false } }, { expiryDate: null },
    { expiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  ] }];
  const batches = await InventoryBatch.find(filter).sort({ expiryDate: 1, createdAt: 1 }).session(session);
  const byProduct = new Map(), changed = new Map();
  for (const batch of batches) {
    const key = String(batch.productId);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(batch);
  }
  return {
    get(productId) { return byProduct.get(String(productId)) || []; },
    mark(batch) { changed.set(String(batch._id), batch); },
    async flush() {
      const operations = [...changed.values()].map(batch => {
        const error = batch.validateSync();
        if (error) throw error;
        return { updateOne: { filter: { _id: batch._id }, update: { $set: {
          sealedPackages: batch.sealedPackages, openQuantity: batch.openQuantity,
        } } } };
      });
      if (!operations.length) return;
      const result = await InventoryBatch.bulkWrite(operations, { session, ordered: true });
      if (result.matchedCount !== operations.length) throw new Error("Stock changed during checkout. Please retry.");
      changed.clear();
    },
  };
}
