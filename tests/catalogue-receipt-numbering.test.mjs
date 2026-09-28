import test from "node:test";
import assert from "node:assert/strict";
import { inventoryValue } from "../src/lib/inventory-value.js";
import { receiptDiscountLabel } from "../src/lib/receipt-discount.js";
import { Sale } from "../src/models/index.js";

test("stock without purchase costs still has a selling value, and missing cost is explicit", () => {
  assert.deepEqual(inventoryValue([{ sealedPackages: 2, openQuantity: 50, packageSize: 100 }], { packageSellingPrice: 80 }), { knownCost: 0, costValue: null, sellingValue: 200, missingCostBatches: 1 });
  assert.deepEqual(inventoryValue([{ sealedPackages: 2, openQuantity: 50, packageSize: 100, purchasePrice: 40 }], { packageSellingPrice: 80 }), { knownCost: 100, costValue: 100, sellingValue: 200, missingCostBatches: 0 });
});
test("count-based inventory never treats tablet quantities as package weight", () => {
  const product = { loosePricingMethod: "count_based", looseConversionType: "fixed", unitsPerPackage: 100, packageSize: 500, packageSellingPrice: 200, loosePricePerUnit: 3 };
  const batches = [{ sealedPackages: 2, openQuantity: 50, purchasePrice: 100, packageSize: 500 }];
  assert.equal(inventoryValue(batches, product).costValue, 250);
  assert.equal(inventoryValue(batches, product).sellingValue, 550);
  assert.equal(inventoryValue(batches, { ...product, looseConversionType: "count_on_open" }).costValue, null);
});
test("receipt percentage survives Mongoose casting and retains the discount amount", () => {
  const sale = new Sale({ invoiceNumber: "0001", subtotal: 500, discount: 50, discountSummary: { discountType: "PERCENTAGE", discountValue: 10, reason: "Wholesale discount" } });
  const saved = sale.toObject();
  assert.equal(receiptDiscountLabel(saved), "Wholesale discount (10%)");
  assert.equal(saved.discount, 50);
  assert.equal(receiptDiscountLabel({ subtotal: 500, discount: 50 }), "Discount (10% effective)");
  assert.equal(receiptDiscountLabel({ discountSummary: { discountType: "FIXED", discountValue: 10 } }), "Discount");
});
