import test from "node:test";
import assert from "node:assert/strict";
import { getBatchExpirySummary } from "../src/lib/batch-expiry.js";

test("Hair Tone Oil's three expired bottles remain visibly flagged", () => {
  const summary = getBatchExpirySummary([
    { sealedPackages: 3, openQuantity: 0, expiryDate: "2026-08-01T00:00:00Z" },
  ], new Date("2026-09-29T12:00:00Z"));
  assert.deepEqual(summary, { expired: true, expiredBatchCount: 1, nearestExpiredExpiry: "2026-08-01T00:00:00.000Z" });
});

test("sold-out expired batches do not flag fresh stock", () => {
  const summary = getBatchExpirySummary([
    { sealedPackages: 0, openQuantity: 0, expiryDate: "2026-08-01" },
    { sealedPackages: 3, expiryDate: "2027-08-01" },
    { sealedPackages: 2, expiryDate: null },
  ], new Date("2026-09-29T12:00:00Z"));
  assert.equal(summary.expired, false);
  assert.equal(summary.nearestExpiredExpiry, null);
});

test("mixed batches flag remaining expired loose stock and show its date", () => {
  const summary = getBatchExpirySummary([
    { sealedPackages: 2, expiryDate: "2027-08-01" },
    { sealedPackages: 0, openQuantity: 20, expiryDate: "2026-08-01" },
  ], new Date("2026-09-29T12:00:00Z"));
  assert.equal(summary.expired, true);
  assert.equal(summary.expiredBatchCount, 1);
  assert.equal(summary.nearestExpiredExpiry, "2026-08-01T00:00:00.000Z");
});

test("expiry today stays valid through today, matching checkout", () => {
  const now = new Date(2026, 8, 29, 14);
  assert.equal(getBatchExpirySummary([
    { sealedPackages: 1, expiryDate: new Date(2026, 8, 29) },
  ], now).expired, false);
  assert.equal(getBatchExpirySummary([
    { sealedPackages: 1, expiryDate: new Date(2026, 8, 28) },
  ], now).expired, true);
});
