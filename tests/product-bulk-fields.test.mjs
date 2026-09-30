import test from "node:test";
import assert from "node:assert/strict";
import { parseBulkProductChanges, bulkProductUpdate } from "../src/lib/product-bulk-fields.js";
import { PRODUCT_IMPORT_FIELDS, productImportAliases, cleanProductImportRow } from "../src/lib/product-import-fields.js";
import { normalizeProductInput, validateProductInput } from "../src/lib/product-validation.js";

const product = normalizeProductInput({ name: "Oil", sku: "OIL", categoryId: "category", baseUnit: "ml", packageType: "Bottle", packageSize: 200, packageSellingPrice: 100, allowPackageSale: true });
test("bulk edits accept current fields and reject identity, inventory and malformed values", () => {
  assert.deepEqual(parseBulkProductChanges({ packageSellingPrice: "120", visibleInSales: false, wholesaleUnit: "Carton", freeSchemeBuyQty: "10" }), { packageSellingPrice: 120, visibleInSales: false, wholesaleUnit: "Carton", freeSchemeBuyQty: 10 });
  for (const changes of [{ sku: "DUPLICATE" }, { openingPackages: 10 }, { gstRate: 101 }, { active: "false" }, { unitsPerStockPack: 1.5 }, { packageSellingPrice: " " }, { priceTiers: "5:no" }]) assert.throws(() => parseBulkProductChanges(changes));
});
test("price changes recalculate proportional loose price without replacing untouched fields", () => {
  assert.deepEqual(bulkProductUpdate(product, { packageSellingPrice: 120 }), { packageSellingPrice: 120, loosePricePerUnit: 0.6 });
  assert.deepEqual(bulkProductUpdate(product, { manufacturer: "Updated" }), { manufacturer: "Updated" });
});
test("stocked products reject conversion edits but permit stock-pack grouping", () => {
  assert.throws(() => bulkProductUpdate(product, { packageSize: 100 }, { hasStock: true }), /while stock exists/);
  assert.deepEqual(bulkProductUpdate(product, { unitsPerStockPack: 12 }, { hasStock: true }), { unitsPerStockPack: 12 });
});
test("GST checks apply only when tax fields change and exemptions stay consistent", () => {
  assert.deepEqual(bulkProductUpdate(product, { visibleInSales: false }, { requireHsn: true }), { visibleInSales: false });
  assert.throws(() => bulkProductUpdate(product, { gstRate: 5 }, { requireHsn: true }), /HSN/);
  assert.deepEqual(bulkProductUpdate(product, { taxable: false }, { requireHsn: true }), { taxable: false, gstExempt: true, gstRate: 0 });
});
test("CSV and manual entry cover stock packs and all current wholesale fields", () => {
  for (const field of ["barcode_type", "stock_pack_type", "units_per_stock_pack", "opening_stock_packs", "opening_individual_packages", "expiry_tracking", "wholesale_pricing_method", "wholesale_discount_percent", "wholesale_sale_unit", "wholesale_pack_enabled", "wholesale_pack_price", "wholesale_loose_price", "free_scheme_free_product"]) assert.ok(PRODUCT_IMPORT_FIELDS.includes(field));
  assert.equal(productImportAliases.wholesalepricingmethod, "wholesale_pricing_method");
  assert.equal(productImportAliases["opening stock packs"], "opening_stock_packs");
});
test("blank optional CSV fields use defaults and numeric zero is retained", () => {
  const clean = cleanProductImportRow({ name: "Oil", sku: "OIL", categoryId: "category", base_unit: "ml", package_type: "Bottle", package_size: "200", package_price: "0", wholesale_enabled: "true", wholesale_sale_unit: "", wholesale_price: "0", units_per_stock_pack: "", opening_packages: "0" });
  const normalized = normalizeProductInput(clean);
  assert.equal(normalized.packageSellingPrice, 0);
  assert.equal(normalized.unitsPerStockPack, 1);
  assert.equal(normalized.wholesaleSaleUnit, "WHOLESALE_PACK");
  assert.deepEqual(validateProductInput(normalized), []);
});
test("legacy total package CSV and current box/remainder CSV produce the same stock", () => {
  const old = normalizeProductInput({ ...product, unitsPerStockPack: 12, openingStockPacks: undefined, openingIndividualPackages: undefined, opening_packages: 25, openingPackages: undefined });
  const current = normalizeProductInput({ ...product, unitsPerStockPack: 12, openingStockPacks: 2, openingIndividualPackages: 1 });
  assert.equal(old.openingPackages, 25);
  assert.equal(current.openingPackages, 25);
  assert.deepEqual(validateProductInput(old), []);
  assert.deepEqual(validateProductInput(current), []);
});
test("enabling wholesale packs inherits stock-pack conversion unless explicitly supplied", () => {
  const grouped = { ...product, stockPackType: "Carton", unitsPerStockPack: 12, wholesaleUnit: "Bottle", unitsPerWholesalePack: 1 };
  const inherited = bulkProductUpdate(grouped, { wholesalePackEnabled: true });
  assert.equal(inherited.wholesaleUnit, "Carton");
  assert.equal(inherited.unitsPerWholesalePack, 12);
  const explicit = bulkProductUpdate(grouped, { wholesalePackEnabled: true, wholesaleUnit: "Box", unitsPerWholesalePack: 6 });
  assert.equal(explicit.wholesaleUnit, "Box");
  assert.equal(explicit.unitsPerWholesalePack, 6);
});
