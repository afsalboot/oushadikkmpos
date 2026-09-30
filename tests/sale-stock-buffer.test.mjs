import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSaleStockBuffer } from "../src/lib/sale-stock-buffer.js";
import { deductPackageStock, deductLooseStock, deductCountBasedLooseStock, isCountBasedProduct, getLooseUnit } from "../src/services/inventory.service.js";

const source = readFileSync(new URL("../src/app/api/sales/route.js", import.meta.url), "utf8");
const consumeSource = source.slice(source.indexOf("async function consumeStock("), source.indexOf("export async function GET"));
function harness(stocks, matchedCount) {
  const calls = [], session = {};
  const batches = stocks.map((stock, index) => ({
    _id: `batch-${index}`, productId: "product", packageSize: 100, sealedPackages: 0, openQuantity: 0, ...stock,
    set(next) { Object.assign(this, next); },
    validateSync() { return this.sealedPackages < 0 || this.openQuantity < 0 ? new Error("Invalid stock") : undefined; },
    async save() { throw new Error("Per-batch writes must not occur"); },
  }));
  const InventoryBatch = {
    find(filter) { calls.push({ type: "read", filter }); return { sort(order) { calls.at(-1).order = order; return { session: async value => { assert.equal(value, session); return batches; } }; } }; },
    async bulkWrite(operations, options) { calls.push({ type: "write", operations, options }); return { matchedCount: matchedCount ?? operations.length }; },
  };
  const consume = new Function("InventoryBatch", "deductPackageStock", "deductLooseStock", "deductCountBasedLooseStock", "isCountBasedProduct", "getLooseUnit", `${consumeSource}; return consumeStock;`)(InventoryBatch, deductPackageStock, deductLooseStock, deductCountBasedLooseStock, isCountBasedProduct, getLooseUnit);
  return { calls, session, batches, InventoryBatch, consume };
}
test("many cart lines use one inventory read and one write with shared transaction state", async () => {
  const h = harness(Array.from({ length: 20 }, (_, index) => ({ productId: `product-${index}`, sealedPackages: 10 })));
  const productIds = h.batches.map(batch => batch.productId);
  const buffer = await createSaleStockBuffer({ InventoryBatch: h.InventoryBatch, productIds, session: h.session });
  const rows = [];
  for (const id of productIds) await h.consume({ _id: id, name: id, baseUnit: "ml" }, "PACKAGE", 3, h.session, rows, undefined, {}, [], buffer);
  assert.equal(h.calls.length, 1);
  await buffer.flush();
  assert.deepEqual(h.calls.map(call => call.type), ["read", "write"]);
  assert.equal(h.calls[1].operations.length, 20);
  assert.equal(h.calls[1].options.session, h.session);
  assert.ok(h.calls[1].operations.every(op => op.updateOne.update.$set.sealedPackages === 7));
  assert.equal(rows.reduce((sum, row) => sum + row.packageQuantity, 0), -60);
  await buffer.flush();
  assert.equal(h.calls.length, 2);
});
test("repeated lines deplete the same FEFO batches and cannot oversell", async () => {
  const h = harness([{ sealedPackages: 2 }, { sealedPackages: 3 }]);
  const buffer = await createSaleStockBuffer({ InventoryBatch: h.InventoryBatch, productIds: ["product", "product"], session: h.session, settings: { batchExpiry: { blockExpiredSales: true } } });
  const product = { _id: "product", name: "Oil", baseUnit: "ml" }, rows = [];
  await h.consume(product, "PACKAGE", 3, h.session, rows, undefined, {}, [], buffer);
  assert.deepEqual(h.batches.map(batch => batch.sealedPackages), [0, 2]);
  await assert.rejects(h.consume(product, "PACKAGE", 3, h.session, rows, undefined, {}, [], buffer), /Insufficient/);
  assert.equal(h.calls.length, 1); // Failed sale never flushes the local changes.
  assert.deepEqual(h.calls[0].order, { expiryDate: 1, createdAt: 1 });
  assert.deepEqual(h.calls[0].filter.productId.$in, ["product"]);
  assert.ok(h.calls[0].filter.$and[0].$or[2].expiryDate.$gte instanceof Date);
});
test("package, loose and free stock share the same final batch update", async () => {
  const h = harness([{ sealedPackages: 4 }]);
  const buffer = await createSaleStockBuffer({ InventoryBatch: h.InventoryBatch, productIds: ["product"], session: h.session });
  const product = { _id: "product", name: "Oil", baseUnit: "ml" }, rows = [];
  await h.consume(product, "PACKAGE", 2, h.session, rows, undefined, {}, [], buffer);
  await h.consume(product, "LOOSE", 25, h.session, rows, undefined, {}, [], buffer);
  await buffer.flush();
  assert.deepEqual(h.calls[1].operations[0].updateOne.update.$set, { sealedPackages: 1, openQuantity: 75 });
  assert.equal(rows.reduce((sum, row) => sum + row.baseQuantity, 0), -225);
});
test("missing batch updates and invalid stock reject the transaction", async () => {
  const h = harness([{ sealedPackages: 2 }], 0);
  const buffer = await createSaleStockBuffer({ InventoryBatch: h.InventoryBatch, productIds: ["product"], session: h.session });
  buffer.mark(h.batches[0]);
  await assert.rejects(buffer.flush(), /Stock changed/);
  h.batches[0].sealedPackages = -1;
  const writes = h.calls.length;
  await assert.rejects(buffer.flush(), /Invalid stock/);
  assert.equal(h.calls.length, writes);
});
test("each transaction retry loads a new stock view", async () => {
  const first = harness([{ sealedPackages: 4 }]), second = harness([{ sealedPackages: 1 }]);
  const a = await createSaleStockBuffer({ InventoryBatch: first.InventoryBatch, productIds: ["product"], session: first.session });
  const b = await createSaleStockBuffer({ InventoryBatch: second.InventoryBatch, productIds: ["product"], session: second.session });
  a.get("product")[0].sealedPackages = 0;
  assert.equal(b.get("product")[0].sealedPackages, 1);
});
