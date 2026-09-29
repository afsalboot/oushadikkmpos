import test from "node:test";
import assert from "node:assert/strict";
import { dashboardStock, dashboardWholesale } from "../src/lib/dashboard-summary.js";

test("dashboard includes cart wholesale discount sales and earlier wholesale invoices once", () => {
  const summary = dashboardWholesale([
    { total: 90, customerId: "a", discountSummary: { reason: "Wholesale discount", totalDiscount: 10 } },
    { total: 20, discountSummary: { reason: "Wholesale discount", totalDiscount: 0 } },
    { saleType: "WHOLESALE", total: 50, customerId: "a", items: [{ saleMode: "WHOLESALE" }] },
    { total: 999, saleType: "SALE" },
  ]);
  assert.deepEqual(summary, { invoices: 3, revenue: 160, customers: 1, discount: 10, averageInvoice: 53.33 });
});

test("deleted or inactive product batches do not enter current stock summaries", () => {
  const product = { _id: "active", name: "Oil", packageSize: 500, packageType: "Bottle", baseUnit: "ml", reorderLevel: 4 };
  const summary = dashboardStock([product], [
    { productId: { _id: "active" }, sealedPackages: 3, openQuantity: 100, packageSize: 500 },
    { productId: "inactive", sealedPackages: 20, packageSize: 500 },
    { productId: null, sealedPackages: 20, packageSize: 500 },
  ]);
  assert.equal(summary.batches.length, 1);
  assert.deepEqual(summary.groups, { ml: 1600 });
  assert.equal(summary.lowStock[0].current, 3.2);
  assert.equal(summary.lowStock[0].unit, "Bottle");
});

test("count-based stock uses loose counts rather than package weight", () => {
  const summary = dashboardStock([{ _id: "jar", name: "Tablets", packageType: "Jar", packageSize: 500, baseUnit: "g", loosePricingMethod: "count_based", looseUnit: "tablet", looseConversionType: "count_on_open", reorderLevel: 2 }], [
    { productId: "jar", sealedPackages: 1, openQuantity: 30, packageSize: 500 },
  ]);
  assert.deepEqual(summary.groups, { tablet: 30 });
  assert.equal(summary.lowStock[0].current, 1);
});

test("empty current inventory and retail-only sales produce empty summaries", () => {
  assert.deepEqual(dashboardStock([], []), { batches: [], groups: {}, lowStock: [] });
  assert.equal(dashboardWholesale([{ total: 10 }]).invoices, 0);
});
