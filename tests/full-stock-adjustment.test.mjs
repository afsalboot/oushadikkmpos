import test from "node:test";
import assert from "node:assert/strict";
import { planFullStockAdjustment } from "../src/lib/full-stock-adjustment.js";

const batches = [
  { _id: "first", sealedPackages: 3, openQuantity: 25, packageSize: 100, batchNumber: "LOT-1" },
  { _id: "second", sealedPackages: 7, openQuantity: 8, packageSize: 100, batchNumber: "LOT-2" },
];

test("full stock corrections use package counts without box conversion", () => {
  assert.deepEqual(planFullStockAdjustment(batches, 150), {
    current: 10, difference: 140, additions: 140, deductions: [],
  });
});

test("reductions span batches without changing open quantities or batch metadata", () => {
  const snapshot = structuredClone(batches);
  const plan = planFullStockAdjustment(batches, 4);
  assert.deepEqual(plan.deductions, [
    { batchId: "first", quantity: 3 }, { batchId: "second", quantity: 3 },
  ]);
  assert.equal(plan.difference, -6);
  assert.equal(plan.additions, 0);
  assert.deepEqual(batches, snapshot);
});

test("zero clears only full packages and unchanged counts have no adjustment", () => {
  assert.equal(planFullStockAdjustment(batches, 0).deductions.reduce((sum, item) => sum + item.quantity, 0), 10);
  assert.deepEqual(planFullStockAdjustment(batches, 10), {
    current: 10, difference: 0, additions: 0, deductions: [],
  });
  assert.equal(planFullStockAdjustment([], 5).additions, 5);
});

test("count-based stock corrections never use package weight as a loose count", () => {
  const plan = planFullStockAdjustment([{ _id: "jar", sealedPackages: 2, openQuantity: 380, packageSize: 500 }], 1);
  assert.deepEqual(plan.deductions, [{ batchId: "jar", quantity: 1 }]);
  assert.equal(plan.difference, -1);
});

test("invalid full stock values are rejected", () => {
  for (const quantity of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planFullStockAdjustment(batches, quantity), /non-negative whole number/);
  }
});
