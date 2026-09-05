import test from "node:test";
import assert from "node:assert/strict";
import { automaticFreeQuantity, buildWholesaleCartItem, buildWholesaleLine, wholesaleLooseRate, wholesaleRate } from "../src/lib/wholesale.js";
import { Product, Sale } from "../src/models/index.js";

const product = {
  name: "Abhayarishtam",
  packageType: "Bottle",
  wholesaleEnabled: true,
  wholesalePrice: 92,
  wholesaleMinQty: 10,
  wholesaleUnit: "Carton",
  unitsPerWholesalePack: 12,
  wholesalePriceTiers: [{ quantity: 24, price: 88 }, { quantity: 48, price: 84 }],
  freeSchemeEnabled: true,
  freeSchemeType: "SAME_PRODUCT",
  freeSchemeBuyQty: 10,
  freeSchemeFreeQty: 1,
};

test("wholesale carton conversion and scheme use box quantities", () => {
  const line = buildWholesaleLine(product, { sellBy: "Carton", quantity: 10 });
  assert.equal(line.paidPackageQuantity, 120);
  assert.equal(line.freeQuantity, 12);
  assert.equal(line.totalOutgoingQuantity, 132);
});

test("highest qualifying wholesale tier is automatic", () => {
  assert.deepEqual(wholesaleRate(product, 30), { price: 88, tier: { quantity: 24, price: 88 } });
  assert.equal(wholesaleRate(product, 60).price, 84);
});

test("discount pricing follows each product retail price", () => {
  const discounted = {
    ...product,
    wholesalePriceTiers: [],
    packageSellingPrice: 200,
    wholesalePricingMethod: "DISCOUNT_FROM_RETAIL",
    wholesaleDiscountPercent: 15,
  };
  assert.equal(wholesaleRate(discounted, 12).price, 170);
});

test("specific wholesale pack price is converted to a package rate", () => {
  const packed = {
    ...product,
    wholesalePriceTiers: [],
    wholesalePackEnabled: true,
    wholesalePackPrice: 960,
    wholesaleMinQty: 1,
  };
  const line = buildWholesaleLine(packed, {
    sellBy: "Carton",
    quantity: 2,
  });
  assert.equal(line.unitPrice, 80);
  assert.equal(line.total, 1920);
});

test("explicit wholesale loose price overrides the package-derived rate", () => {
  assert.equal(
    wholesaleLooseRate({
      ...product,
      packageSize: 100,
      wholesaleLoosePrice: 1.25,
    }),
    1.25,
  );
});

test("free quantity scales without billing the free stock", () => {
  assert.equal(automaticFreeQuantity(product, 120), 12);
  const line = buildWholesaleLine(product, { sellBy: "Bottle", quantity: 120 });
  assert.equal(line.total, 120 * 84);
  assert.equal(line.freeQuantity, 12);
  assert.equal(line.totalOutgoingQuantity, 132);
});

test("manual free quantity is separated from paid quantity", () => {
  const line = buildWholesaleLine(product, { sellBy: "Bottle", quantity: 120, manualFreeQuantity: 4, manualFreeReason: "Promotion" });
  assert.equal(line.paidPackageQuantity, 120);
  assert.equal(line.freeQuantity, 4);
  assert.equal(line.total, 120 * 84);
  assert.equal(line.manualFree, true);
});

test("MOQ and invalid free quantity are rejected", () => {
  assert.throws(() => buildWholesaleLine(product, { sellBy: "Bottle", quantity: 2 }), /Minimum wholesale order/);
  assert.throws(() => buildWholesaleLine(product, { sellBy: "Bottle", quantity: 120, manualFreeQuantity: -1 }), /non-negative/);
});

test("wholesale cart keeps the database product id separate from its UI key", () => {
  const databaseId = "64b7f4c2e138237f62b7d901";
  const line = buildWholesaleLine({ ...product, _id: databaseId }, { sellBy: "Carton", quantity: 10 });
  const cartItem = buildWholesaleCartItem({ ...product, _id: databaseId }, line);

  assert.equal(cartItem.productId, databaseId);
  assert.equal(cartItem._id, `wholesale-${databaseId}`);

  const editedItem = buildWholesaleCartItem(cartItem, { ...line, orderedQuantity: 20 });
  assert.equal(editedItem.productId, databaseId);
  assert.equal(editedItem._id, `wholesale-${databaseId}`);
});

test("hydrated products retain wholesale configuration", () => {
  const hydrated = Product.hydrate({
    wholesaleEnabled: true,
    wholesalePrice: 88,
    wholesaleMinQty: 12,
    wholesaleUnit: "Carton",
    unitsPerWholesalePack: 12,
    wholesalePricingMethod: "DISCOUNT_FROM_RETAIL",
    wholesaleDiscountPercent: 10,
    wholesalePackPrice: 900,
    wholesaleLoosePrice: 1.5,
  });

  assert.equal(hydrated.wholesaleEnabled, true);
  assert.equal(hydrated.wholesalePrice, 88);
  assert.equal(hydrated.wholesaleMinQty, 12);
  assert.equal(hydrated.wholesaleUnit, "Carton");
  assert.equal(hydrated.unitsPerWholesalePack, 12);
  assert.equal(hydrated.wholesalePricingMethod, "DISCOUNT_FROM_RETAIL");
  assert.equal(hydrated.wholesaleDiscountPercent, 10);
  assert.equal(hydrated.wholesalePackPrice, 900);
  assert.equal(hydrated.wholesaleLoosePrice, 1.5);
});

test("credit invoices retain unpaid balances without a collected payment", async () => {
  const creditSale = new Sale({
    invoiceNumber: "WSI-20260903-001",
    items: [],
    subtotal: 500,
    total: 500,
    payments: [],
    paymentStatus: "UNPAID",
    amountPaid: 0,
    balanceDue: 500,
  });

  await creditSale.validate();
  assert.equal(creditSale.paymentStatus, "UNPAID");
  assert.equal(creditSale.balanceDue, 500);
  assert.deepEqual(creditSale.payments, []);
});
