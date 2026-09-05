import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustedProductPrice,
  bulkProductSectionsTouched,
  classifyBulkDeletion,
  missingWholesaleDefaults,
} from "../src/lib/product-bulk.js";

test("bulk price adjustment supports increases, reductions, and currency rounding", () => {
  assert.equal(adjustedProductPrice(199.99, 5), 209.99);
  assert.equal(adjustedProductPrice(120, -10), 108);
  assert.equal(adjustedProductPrice(0, 25), 0);
});

test("mass deletion preserves products with stock or transaction history", () => {
  const products = [{ _id: "unused" }, { _id: "sold" }, { _id: "stocked" }];
  const result = classifyBulkDeletion(products, ["sold", "stocked"]);
  assert.deepEqual(result.deleteIds, ["unused"]);
  assert.deepEqual(result.deactivateIds, ["sold", "stocked"]);
});

test("enabling wholesale repairs missing legacy defaults before validation", () => {
  const defaults = missingWholesaleDefaults(
    {
      wholesaleEnabled: true,
      packageSellingPrice: 180,
      packageType: "Bottle",
    },
    ["Bottle", "Box", "Carton"],
  );
  assert.equal(defaults.wholesalePrice, 180);
  assert.equal(defaults.wholesalePricingMethod, "FIXED");
  assert.equal(defaults.wholesaleDiscountPercent, 0);
  assert.equal(defaults.wholesaleMinQty, 1);
  assert.equal(defaults.wholesaleSaleUnit, "WHOLESALE_PACK");
  assert.equal(defaults.wholesaleUnit, "Bottle");
  assert.equal(defaults.wholesalePackEnabled, true);
  assert.equal(defaults.unitsPerWholesalePack, 1);
  assert.equal(defaults.allowWholesaleLooseSale, false);
  assert.equal(defaults.freeSchemeEnabled, false);
});

test("wholesale-only bulk edits do not trigger GST and HSN validation", () => {
  assert.deepEqual(bulkProductSectionsTouched({ wholesaleEnabled: true }), {
    gst: false,
    wholesale: true,
  });
  assert.deepEqual(bulkProductSectionsTouched({ categoryId: "category" }), {
    gst: false,
    wholesale: false,
  });
  assert.deepEqual(bulkProductSectionsTouched({ gstRate: 5 }), {
    gst: true,
    wholesale: false,
  });
  assert.deepEqual(
    bulkProductSectionsTouched({
      wholesalePricingMethod: "DISCOUNT_FROM_RETAIL",
      wholesalePackPrice: 960,
      wholesaleLoosePrice: 1.25,
    }),
    { gst: false, wholesale: true },
  );
});
