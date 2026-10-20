import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalePricing } from "../src/services/pricing.service.js";
import { saleAnalyticsFacts } from "../src/lib/sale-retention.js";

const input = { items: [{ amount: 100 }], settings: { gst: { enabled: false }, roundOff: { enabled: false } } };

test("treatment fee is optional and adds independently to consultation fee", () => {
  assert.equal(calculateSalePricing({ ...input, treatmentFee: 50 }).total, 100);
  const result = calculateSalePricing({ ...input, consultationFeeEnabled: true, consultationFee: 20,
    treatmentFeeEnabled: true, treatmentFee: "50.25" });
  assert.equal(result.treatmentFee, 50.25);
  assert.equal(result.consultationFee, 20);
  assert.equal(result.beforeRoundOff, 170.25);
  assert.equal(result.total, 170.25);
  assert.deepEqual(result.validationErrors, []);
});

test("enabled treatment fees reject missing, nonfinite, negative and excessive amounts", () => {
  for (const treatmentFee of ["", undefined, null, 0, -1, "invalid", Infinity, 100000000, 0.001]) {
    const result = calculateSalePricing({ ...input, treatmentFeeEnabled: true, treatmentFee });
    assert.ok(result.validationErrors.some(error => /treatment fee/i.test(error)), String(treatmentFee));
  }
});

test("treatment fees survive retained sale facts", () => {
  assert.equal(saleAnalyticsFacts({ treatmentFee: 50.25, items: [] }).treatmentFee, 50.25);
});
