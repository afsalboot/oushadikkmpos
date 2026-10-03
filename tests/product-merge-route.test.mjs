import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { productDuplicateKey, productMergeProblem, resolvePurchaseItemBatch } from "../src/lib/product-duplicates.js";
import { PRODUCT_DUPLICATE_OPTIONS } from "../src/lib/product-import-duplicates.js";

const route = (await readFile(new URL("../src/app/api/products/merge/route.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace("export async function POST", "async function POST");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const targetId = "aaaaaaaaaaaaaaaaaaaaaaaa", sourceId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const target = { _id: targetId, name: "Oil", sku: "KEEP", manufacturer: "Brand", categoryId: "cat", packageSize: 200, baseUnit: "ml", packageType: "Bottle", packageSellingPrice: 50 };

async function invoke({ change = {}, body = { targetId, sourceIds: [sourceId] }, staff = false, ambiguous = false } = {}) {
  const writes = [], permissions = [], session = { id: "transaction" };
  const source = { ...target, _id: sourceId, sku: "REMOVE", packageSellingPrice: 80, ...change };
  const batch = { _id: "batch-source", productId: sourceId, batchNumber: "DEFAULT", sealedPackages: 3, purchasePrice: 25 };
  const batches = [{ ...batch, _id: "batch-target", productId: targetId }, batch, ...(ambiguous ? [{ ...batch, _id: "batch-ambiguous" }] : [])];
  const purchase = { _id: "purchase", purchaseNumber: "PUR-1", items: [{ productId: sourceId, batchNumber: "DEFAULT", name: "Original oil", productSnapshot: { sku: "REMOVE" } }], async save(options) { writes.push({ model: "Purchase", method: "save", options }); } };
  const query = value => ({ session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const model = name => Object.fromEntries(["updateMany", "updateOne", "deleteMany", "create"].map(method => [method, async (...args) => { writes.push({ model: name, method, args, options: args.at(-1) }); }]));
  const Product = { ...model("Product"), findById: () => query(target), find: () => query([source]) };
  const InventoryBatch = { ...model("InventoryBatch"), find: filter => query(filter.productId.$in.length === 1 ? [batch] : batches) };
  const StockTransaction = { ...model("StockTransaction"), find: () => query(ambiguous ? [] : [{ productId: sourceId, batchId: batch._id }]) };
  const Purchase = { ...model("Purchase"), find: () => query([purchase]) };
  const mongoose = { isValidObjectId: value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value), connection: { transaction: async callback => callback(session) } };
  const dependencies = { mongoose, connectDb: async () => {}, requireSession: async permission => { permissions.push(permission); if (staff) throw Object.assign(new Error("FORBIDDEN"), { status: 403 }); return { sub: "owner" }; }, ok: data => ({ status: 200, data }), fail: (error, status = 400) => ({ status, error }), apiError: error => ({ status: error.status || 500, error: error.message }), Product, InventoryBatch, StockTransaction, Sale: model("Sale"), Purchase, AuditLog: model("AuditLog"), productDuplicateKey, productMergeProblem, resolvePurchaseItemBatch, PRODUCT_DUPLICATE_OPTIONS };
  const run = new AsyncFunction(...Object.keys(dependencies), "request", `${route}\nreturn POST(request);`);
  const response = await run(...Object.values(dependencies), { json: async () => body });
  return { response, writes, permissions, purchase, session };
}

test("merge endpoint requires owner access and makes no writes for staff", async () => {
  const result = await invoke({ staff: true });
  assert.deepEqual(result.permissions, ["ADMIN"]);
  assert.equal(result.response.status, 403);
  assert.deepEqual(result.writes, []);
});

test("merge rejects invalid, repeated and self-referencing IDs before writes", async () => {
  for (const sourceIds of [[], [targetId], [sourceId, sourceId], ["invalid"]]) {
    const result = await invoke({ body: { targetId, sourceIds } });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.writes, []);
  }
});

test("name duplicates with different pack sizes cannot merge", async () => {
  const result = await invoke({ body: { targetId, sourceIds: [sourceId], matchBy: "NAME" }, change: { packageSize: 100 } });
  assert.equal(result.response.status, 409);
  assert.deepEqual(result.writes, []);
});

test("ambiguous purchase batches stop the merge before records move", async () => {
  const result = await invoke({ ambiguous: true });
  assert.equal(result.response.status, 409);
  assert.deepEqual(result.writes, []);
});

test("merge moves references transactionally, preserves snapshots and batch quantities, audits before deleting", async () => {
  const { response, writes, purchase, session } = await invoke();
  assert.equal(response.status, 200);
  assert.equal(response.data.merged, 1);
  assert.equal(purchase.items[0].batchId, "batch-source");
  assert.equal(purchase.items[0].name, "Original oil");
  assert.deepEqual(purchase.items[0].productSnapshot, { sku: "REMOVE" });
  assert.ok(writes.every(write => write.options.session === session));
  const batchWrite = writes.find(write => write.model === "InventoryBatch");
  assert.deepEqual(batchWrite.args[1], { $set: { productId: targetId } });
  const salesWrites = writes.filter(write => write.model === "Sale");
  assert.equal(salesWrites.length, 3);
  assert.ok(salesWrites.some(write => Object.hasOwn(write.args[1].$set, "items.$[mix].ingredients.$[ingredient].productId")));
  const audit = writes.find(write => write.model === "AuditLog");
  assert.equal(audit.args[0][0].metadata.sources[0].sku, "REMOVE");
  assert.equal(audit.args[0][0].metadata.batches[0].sealedPackages, 3);
  assert.equal(writes.at(-1).method, "deleteMany");
  assert.equal(writes.at(-1).model, "Product");
  const survivor = writes.find(write => write.model === "Product" && write.method === "updateOne");
  assert.deepEqual(Object.keys(survivor.args[1].$set), ["updatedAt"]);
});
