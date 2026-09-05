import test from "node:test";
import assert from "node:assert/strict";
import {
  isWholesaleSale,
  summarizeWholesaleSales,
  wholesaleLineQuantities,
} from "../src/lib/wholesale-reporting.js";

const wholesaleSale = {
  _id: "sale-1",
  saleType: "WHOLESALE",
  customerId: "customer-1",
  total: 1800,
  items: [
    {
      productId: "product-1",
      name: "Abhaya Choornam",
      saleMode: "WHOLESALE",
      paidQuantity: 20,
      freeQuantity: 2,
      totalOutgoingQuantity: 22,
      total: 1800,
    },
  ],
};

test("wholesale reporting keeps billed, free, and outgoing quantities separate", () => {
  assert.deepEqual(wholesaleLineQuantities(wholesaleSale.items[0]), {
    paid: 20,
    free: 2,
    outgoing: 22,
  });
  const summary = summarizeWholesaleSales([wholesaleSale]);
  assert.deepEqual(
    {
      invoices: summary.invoices,
      customers: summary.customers,
      revenue: summary.revenue,
      paid: summary.paidQuantity,
      free: summary.freeQuantity,
      outgoing: summary.totalOutgoing,
    },
    {
      invoices: 1,
      customers: 1,
      revenue: 1800,
      paid: 20,
      free: 2,
      outgoing: 22,
    },
  );
});

test("legacy wholesale lines are recognized even without saleType", () => {
  assert.equal(isWholesaleSale({ items: wholesaleSale.items }), true);
  assert.equal(
    isWholesaleSale({ saleType: "SALE", items: [{ saleMode: "PACKAGE" }] }),
    false,
  );
});
