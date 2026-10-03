import test from "node:test";
import assert from "node:assert/strict";
import { findProductDuplicateGroups, productDuplicateKey, productMergeProblem, resolvePurchaseItemBatch } from "../src/lib/product-duplicates.js";

const product = { _id: "a", name: "Herbal Oil", categoryId: "oils", manufacturer: "Oushadhi", packageSize: 200, baseUnit: "ml", packageType: "Bottle", sku: "OIL-A" };

test("duplicate details normalize names and brands while preserving distinct pack sizes and brands", () => {
  const duplicate = { ...product, _id: "b", name: " HERBAL   oil ", manufacturer: " OUSHADHI ", sku: "OIL-B", active: false, categoryId: { _id: "oils" } };
  assert.equal(productDuplicateKey(product), productDuplicateKey(duplicate));
  const groups = findProductDuplicateGroups([product, duplicate, { ...product, packageSize: 100 }, { ...product, manufacturer: "Other" }]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(item => item._id), ["a", "b"]);
});

test("name check finds different packs for review; empty identifiers never form duplicate groups", () => {
  assert.equal(findProductDuplicateGroups([product, { ...product, packageSize: 100 }], "NAME").length, 1);
  assert.deepEqual(findProductDuplicateGroups([{ barcode: "" }, { barcode: "" }], "BARCODE"), []);
  assert.deepEqual(findProductDuplicateGroups([{ sku: "" }, { sku: "" }], "SKU"), []);
  assert.equal(productDuplicateKey({ ...product, packageSize: 0 }), null);
});

test("merge allows price differences but rejects incompatible physical inventory", () => {
  assert.equal(productMergeProblem(product, { ...product, packageSellingPrice: 999 }), null);
  for (const change of [{ packageSize: 100 }, { baseUnit: "g" }, { packageType: "Jar" }, { manufacturer: "Other" }, { unitsPerWholesalePack: 12 }, { unitsPerStockPack: 6 }, { loosePricingMethod: "count_based" }]) assert.ok(productMergeProblem(product, { ...product, ...change }));
  const counted = { ...product, loosePricingMethod: "count_based", looseUnit: "tablet", looseConversionType: "fixed", unitsPerPackage: 60 };
  assert.ok(productMergeProblem(counted, { ...counted, unitsPerPackage: 100 }));
  assert.ok(productMergeProblem(counted, { ...counted, looseUnit: "capsule" }));
});

test("purchase cancellation keeps its original batch when merged products share batch names", () => {
  const batches = [{ _id: "batch-a", productId: "a", batchNumber: "DEFAULT" }, { _id: "batch-b", productId: "b", batchNumber: "DEFAULT" }];
  const item = { productId: "b", batchNumber: "DEFAULT" };
  assert.equal(resolvePurchaseItemBatch(item, [{ productId: "b", batchId: "batch-b" }], batches), "batch-b");
  assert.equal(resolvePurchaseItemBatch({ ...item, productId: "a", batchId: "batch-b" }, [], batches), "batch-b");
  assert.equal(resolvePurchaseItemBatch(item, [], []), null);
  assert.equal(resolvePurchaseItemBatch(item, [], [...batches, { _id: "ambiguous", productId: "b", batchNumber: "DEFAULT" }]), null);
});
