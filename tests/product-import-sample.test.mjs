import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { PRODUCT_SAMPLE_FIELDS, productImportSampleRows } from "../src/lib/product-import-sample.js";
import { REQUIRED_PRODUCT_IMPORT_FIELDS, cleanProductImportRow, productImportAliases } from "../src/lib/product-import-fields.js";
import { normalizeProductInput, validateProductInput } from "../src/lib/product-validation.js";

test("simple sample imports required details and full opening stock", () => {
  assert.deepEqual(PRODUCT_SAMPLE_FIELDS, [...REQUIRED_PRODUCT_IMPORT_FIELDS,
    "full_stock"]);
  const parsed = Papa.parse(Papa.unparse(productImportSampleRows("Existing category"), { columns: PRODUCT_SAMPLE_FIELDS }), { header: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.meta.fields, PRODUCT_SAMPLE_FIELDS);
  assert.equal(parsed.data.length, 3);
  parsed.data.forEach((row, index) => {
    const mapped = Object.fromEntries(Object.entries(row).map(([key, value]) => [productImportAliases[key] || key, value]));
    const product = normalizeProductInput({ ...cleanProductImportRow(mapped), sku: "AUTO-GENERATED", categoryId: "category" });
    assert.deepEqual(validateProductInput(product), [], row.name);
    assert.equal(row.category, "Existing category");
    assert.equal(product.openingPackages, [27, 15, 30][index]);
    assert.equal(product.openingQuantity, 0);
    assert.equal(product.wholesaleEnabled, false);
  });
});

test("standalone sample matches in-app sample", () => {
  const csv = readFileSync(new URL("../public/samples/oushadhi-products-simple-template.csv", import.meta.url), "utf8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true, dynamicTyping: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.meta.fields, PRODUCT_SAMPLE_FIELDS);
  assert.deepEqual(parsed.data, productImportSampleRows());
});
