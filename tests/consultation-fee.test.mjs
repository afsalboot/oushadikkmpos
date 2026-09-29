import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalePricing } from "../src/services/pricing.service.js";
import { Sale } from "../src/models/index.js";

const settings = { discount: { enabled: false }, gst: { enabled: false }, roundOff: { enabled: false } };
const price = (options = {}) => calculateSalePricing({ items: [{ amount: 60 }], settings, ...options });

test("consultation fee increases total without altering product subtotal", () => {
  const result = price({ consultationFeeEnabled: true, consultationFee: "150.50" });
  assert.equal(result.subtotal, 60);
  assert.equal(result.consultationFee, 150.5);
  assert.equal(result.total, 210.5);
  assert.deepEqual(result.validationErrors, []);
});

test("unchecking consultation ignores a previously entered amount", () => {
  assert.equal(price({ consultationFeeEnabled: false, consultationFee: 150 }).total, 60);
  assert.equal(price().consultationFee, 0);
});

test("wholesale discount applies to products and does not reduce consultation fee", () => {
  const result = price({ consultationFeeEnabled: true, consultationFee: 150, wholesaleDiscount: 10 });
  assert.equal(result.totalDiscount, 6);
  assert.equal(result.total, 204);
});

test("rounding includes the consultation fee", () => {
  const result = price({ consultationFeeEnabled: true, consultationFee: 10.4, settings: { ...settings, roundOff: { enabled: true, method: "NEAREST", precision: 1 } } });
  assert.equal(result.beforeRoundOff, 70.4);
  assert.equal(result.total, 70);
  assert.equal(result.roundOff, -0.4);
});

test("enabled consultation fee rejects blank, negative, non-finite and excessive values", () => {
  for (const consultationFee of ["", 0, -10, "invalid", Infinity, 100000000]) {
    assert.ok(price({ consultationFeeEnabled: true, consultationFee }).validationErrors.length);
  }
});

test("saved sale retains fee and finalized fee field is immutable", () => {
  const sale = new Sale({ consultationFee: 150 });
  assert.equal(sale.toObject().consultationFee, 150);
  assert.ok(Sale.schema.path("consultationFee").options.immutable);
});
