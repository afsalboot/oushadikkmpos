import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saleFreeQuantity } from "../src/lib/sale-free-quantity.js";
import { deductPackageStock, deductLooseStock, deductCountBasedLooseStock, isCountBasedProduct, getLooseUnit } from "../src/services/inventory.service.js";

const options = { wholesale: true, saleMode: "PACKAGE", role: "ADMIN" };
test("free quantities require wholesale and valid stock units", () => {
  assert.equal(saleFreeQuantity(undefined, options), 0);
  assert.equal(saleFreeQuantity("2", options), 2);
  for (const value of [-1, Infinity, NaN, "invalid", 1.5]) assert.throws(() => saleFreeQuantity(value, options));
  assert.throws(() => saleFreeQuantity(1, { ...options, wholesale: false }), /Wholesale/);
  assert.throws(() => saleFreeQuantity(1, { ...options, role: "CASHIER" }), /administrator/);
  assert.equal(saleFreeQuantity(0.5, { ...options, saleMode: "LOOSE" }), 0.5);
  assert.throws(() => saleFreeQuantity(0.5, { ...options, saleMode: "LOOSE", countBased: true }), /whole/);
});

// Exercise the route's batch consumption with in-memory batches, never a live database.
const source = readFileSync(new URL("../src/app/api/sales/route.js", import.meta.url), "utf8");
const consumeSource = source.slice(source.indexOf("async function consumeStock("), source.indexOf("export async function GET"));
function harness(counts) {
  const session = {}, saves = [];
  const batches = counts.map((sealedPackages, index) => ({
    _id: `batch-${index}`, sealedPackages, packageSize: 100, openQuantity: 0,
    set(next) { Object.assign(this, next); },
    async save(options) { saves.push(options.session); },
  }));
  const InventoryBatch = { find: () => ({ sort: () => ({ session: async () => batches }) }) };
  const consume = new Function("InventoryBatch", "deductPackageStock", "deductLooseStock", "deductCountBasedLooseStock", "isCountBasedProduct", "getLooseUnit", `${consumeSource}; return consumeStock;`)(InventoryBatch, deductPackageStock, deductLooseStock, deductCountBasedLooseStock, isCountBasedProduct, getLooseUnit);
  return { consume, batches, saves, session };
}
test("paid plus free packages consume stock across batches in the sale transaction", async () => {
  const { consume, batches, saves, session } = harness([3, 5]), rows = [];
  const paid = 4, free = saleFreeQuantity(2, options);
  await consume({ _id: "product", name: "Oil", baseUnit: "ml" }, "PACKAGE", paid + free, session, rows);
  assert.deepEqual(batches.map(batch => batch.sealedPackages), [0, 2]);
  assert.equal(rows.reduce((sum, row) => sum + row.packageQuantity, 0), -6);
  assert.equal(rows.reduce((sum, row) => sum + row.baseQuantity, 0), -600);
  assert.ok(saves.every(savedSession => savedSession === session));
});
test("insufficient stock for free units rejects the transaction callback", async () => {
  const { consume, session } = harness([5]);
  await assert.rejects(consume({ _id: "product", name: "Oil" }, "PACKAGE", 4 + saleFreeQuantity(2, options), session, []), /Insufficient/);
});
test("counted free loose units consume counts rather than package weight", async () => {
  const { consume, batches, session } = harness([1]), rows = [];
  await consume({ _id: "product", name: "Tablets", loosePricingMethod: "count_based", looseConversionType: "fixed", unitsPerPackage: 20, looseUnit: "tablet" }, "LOOSE", 5 + saleFreeQuantity(2, { ...options, saleMode: "LOOSE", countBased: true }), session, rows);
  assert.equal(batches[0].sealedPackages, 0);
  assert.equal(batches[0].openQuantity, 13);
  assert.equal(rows.at(-1).looseQuantity, -7);
});
