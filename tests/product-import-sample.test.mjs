import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { productImportSampleRows } from "../src/lib/product-import-sample.js";
import { PRODUCT_TEMPLATE_FIELDS, cleanProductImportRow } from "../src/lib/product-import-fields.js";
import { normalizeProductInput, validateProductInput } from "../src/lib/product-validation.js";

test("download sample round-trips through CSV with current fields and valid products", () => {
  const rows = productImportSampleRows("Existing category");
  const parsed = Papa.parse(Papa.unparse(rows, { columns: PRODUCT_TEMPLATE_FIELDS }), { header: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.meta.fields, PRODUCT_TEMPLATE_FIELDS);
  assert.equal(parsed.data.length, 6);
  const precedingSkus = new Set();
  for (const row of parsed.data) {
    const normalized = normalizeProductInput({ ...cleanProductImportRow(row), categoryId: "category" });
    assert.deepEqual(validateProductInput(normalized), [], row.name);
    assert.equal(row.category, "Existing category");
    assert.ok(normalized.hsnCode);
    assert.equal(normalized.openingPackages, 0);
    assert.equal(normalized.openingQuantity, 0);
    if (normalized.freeSchemeType === "DIFFERENT_PRODUCT") assert.ok(precedingSkus.has(row.free_scheme_free_product));
    assert.ok(!precedingSkus.has(row.sku));
    precedingSkus.add(row.sku);
  }
});
test("sample illustrates fixed and percentage wholesale prices and both loose count conversions", () => {
  const rows = productImportSampleRows();
  assert.ok(rows.some(row => row.wholesale_pricing_method === "FIXED" && row.wholesale_enabled === "true"));
  assert.ok(rows.some(row => row.wholesale_pricing_method === "DISCOUNT_FROM_RETAIL" && Number(row.wholesale_discount_percent) > 0));
  assert.ok(rows.some(row => row.wholesale_loose_price && row.allow_wholesale_loose_sale === "true"));
  assert.ok(rows.some(row => row.loose_conversion_type === "fixed"));
  assert.ok(rows.some(row => row.loose_conversion_type === "count_on_open"));
});
