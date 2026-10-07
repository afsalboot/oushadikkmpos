import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeProductInput, validateProductInput } from "../src/lib/product-validation.js";
import { productCreationKey } from "../src/lib/product-duplicates.js";

const source = (await readFile(new URL("../src/services/product.service.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const original = { _id: "old", name: "Herbal Oil", sku: "OLD", categoryId: "category", manufacturer: "Brand", baseUnit: "ml", packageType: "Bottle", packageSize: 200, batchNumber: "LOT-1", packageSellingPrice: 100 };

async function create(change) {
  const products = [], batches = [], transactions = [];
  const query = value => ({ select() { return this; }, session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const dependencies = {
    mongoose: { isValidObjectId: () => true },
    Product: { findOne: () => query(null), find: () => query([original]), create: async ([fields]) => { const product = { ...fields, _id: "new" }; products.push(product); return [product]; } },
    Category: { exists: () => query(true) },
    Settings: { findOne: () => query(null) },
    InventoryBatch: { create: async ([fields]) => { batches.push(fields); return [{ ...fields, _id: "batch" }]; } },
    StockTransaction: { create: async ([fields]) => transactions.push(fields) },
    isCountBasedProduct: () => false,
    getLooseUnit: product => product.baseUnit,
    normalizeProductInput, validateProductInput, productCreationKey,
  };
  const run = new AsyncFunction(...Object.keys(dependencies), "input", `${source}\nreturn createProduct(input, 'actor', { id: 'session' });`);
  const result = await run(...Object.values(dependencies), { ...original, sku: "NEW", openingPackages: 2, ...change });
  return { result, products, batches, transactions };
}

test("product creation saves same-name batch/price variants and their opening inventory", async () => {
  for (const change of [{ batchNumber: "LOT-2", packageSellingPrice: 120 }, { batchNumber: "LOT-2" }, { packageSellingPrice: 120 }]) {
    const { result, batches, transactions } = await create(change);
    assert.equal(result.name, original.name);
    assert.equal(result.batchNumber, change.batchNumber || original.batchNumber);
    assert.equal(result.duplicateKey, productCreationKey(result));
    assert.equal(batches[0].batchNumber, result.batchNumber);
    assert.equal(batches[0].sellingPrice, result.packageSellingPrice);
    assert.equal(batches[0].sealedPackages, 2);
    assert.equal(transactions[0].batchId, "batch");
  }
});

test("product creation rejects identical details, batch and price with HTTP 409", async () => {
  await assert.rejects(create({ name: " herbal oil ", batchNumber: " lot-1 " }), error => error.status === 409 && /same batch and selling price/.test(error.message));
});

test("batch identity persists even when no opening stock is supplied", async () => {
  const { result, batches } = await create({ batchNumber: "LOT-2", openingPackages: 0 });
  assert.equal(result.batchNumber, "LOT-2");
  assert.deepEqual(batches, []);
});
