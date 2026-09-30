import test from "node:test";
import assert from "node:assert/strict";
import { createProductImportDuplicateIndex } from "../src/lib/product-import-duplicates.js";

const product = { name: "Herbal Oil", manufacturer: "Oushadhi", categoryId: "oil", baseUnit: "ml", packageType: "Bottle", packageSize: 200, sku: "EXISTING" };

test("selected name matching ignores pack size while details matching keeps it distinct", () => {
  const nameIndex = createProductImportDuplicateIndex([product], "NAME");
  const otherPack = { ...product, name: "HERBAL OIL", packageSize: 100, manufacturer: "Other" };
  assert.equal(nameIndex.find(otherPack).sku, "EXISTING");
  assert.equal(createProductImportDuplicateIndex([product], "DETAILS").find(otherPack), undefined);
  nameIndex.add({ ...product, name: "New item", importRow: 5 });
  assert.equal(nameIndex.find({ name: "new item" }).row, 5);
});

test("SKU and barcode matching ignore empty values and match only the selected identifier", () => {
  const skuIndex = createProductImportDuplicateIndex([product], "SKU");
  assert.equal(skuIndex.find({ sku: "existing", name: "Different" }).sku, "EXISTING");
  assert.equal(skuIndex.find({ name: product.name }), undefined);
  const barcodeIndex = createProductImportDuplicateIndex([{ ...product, barcode: "00123" }], "BARCODE");
  assert.equal(barcodeIndex.find({ barcode: "00123" }).sku, "EXISTING");
  assert.equal(barcodeIndex.find({ barcode: "123" }), undefined);
  assert.equal(barcodeIndex.find({ barcode: "" }), undefined);
});

test("imports identify existing products without SKU despite case and spacing differences", () => {
  const index = createProductImportDuplicateIndex([product]);
  assert.equal(index.find({ ...product, sku: undefined, name: " HERBAL   oil ", manufacturer: "OUSHADHI", packageSize: "200" }).sku, "EXISTING");
  assert.equal(index.find({ ...product, sku: undefined, manufacturer: "" }).sku, "EXISTING");
});

test("different sizes, units, categories, packaging and specified brands remain distinct", () => {
  const index = createProductImportDuplicateIndex([product]);
  for (const change of [{ packageSize: 100 }, { baseUnit: "g" }, { categoryId: "other" }, { packageType: "Jar" }, { manufacturer: "Other brand" }, { name: "Another Oil" }]) {
    assert.equal(index.find({ ...product, ...change }), undefined);
  }
});

test("successful rows enter duplicate index for later rows and later batches", () => {
  const index = createProductImportDuplicateIndex();
  assert.equal(index.find(product), undefined);
  index.add(product);
  assert.equal(index.find({ ...product, sku: "GENERATED-AGAIN" }).sku, "EXISTING");
  const nextBatchIndex = createProductImportDuplicateIndex([product]);
  assert.equal(nextBatchIndex.find({ ...product, sku: undefined }).sku, "EXISTING");
  assert.equal(index.find({ ...product, packageSize: "" }), undefined);
});
