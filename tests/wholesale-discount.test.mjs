import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalePricing } from "../src/services/pricing.service.js";

test("wholesale bill discount works with normal discounts disabled", () => {
  const settings = { discount: { enabled: false, cartLevel: false, itemLevel: false,
    allowPercentage: false, requireReason: true }, gst: { enabled: false }, roundOff: { enabled: false } };
  const items = [{ amount: 60 }, { amount: 140 }];
  const result = calculateSalePricing({items, settings, wholesaleDiscount: 10, currentUser: {role:"STAFF"}});
  assert.equal(result.total, 180);
  assert.equal(result.cartDiscount, 20);
  assert.equal(result.itemDiscount, 0);
  assert.equal(result.discountValue, 10);
  assert.equal(result.reason, "Wholesale discount");
  assert.deepEqual(result.validationErrors, []);
  assert.equal(settings.discount.enabled, false);
  assert.equal(calculateSalePricing({items,settings}).total, 200);
});

test("wholesale discount does not stack with automatic or product discounts", () => {
  const result = calculateSalePricing({items:[{amount:200,discount:{type:"PERCENTAGE",value:50}}],
    settings:{discount:{enabled:true,automaticEnabled:true,automaticAbove:1,automaticPercentage:20},gst:{enabled:false},roundOff:{enabled:false}},
    discount:{type:"PERCENTAGE",value:30},wholesaleDiscount:10});
  assert.equal(result.total,180);
  assert.equal(result.automaticDiscount,0);
  assert.equal(result.itemDiscount,0);
});

test("wholesale percentage is validated on the shared server pricing path", () => {
  const input = {items:[{amount:60}],settings:{gst:{enabled:false},roundOff:{enabled:false}}};
  for (const wholesaleDiscount of [-1, 101, "invalid", Infinity]) {
    assert.ok(calculateSalePricing({...input,wholesaleDiscount}).validationErrors.length > 0);
  }
  assert.equal(calculateSalePricing({...input,wholesaleDiscount:0}).total,60);
  assert.equal(calculateSalePricing({...input,wholesaleDiscount:100}).total,0);
});
