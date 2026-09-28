import test from "node:test";
import assert from "node:assert/strict";
import { planFutureInvoiceReset } from "../src/lib/future-invoice-reset.js";
import { nextInvoiceNumber } from "../src/services/document-number.service.js";

test("reset keeps INV and previews timestamp format with 001 in India time", () => {
  const plan = planFutureInvoiceReset({ value: "2026-09-29T10:30:45Z" });
  assert.equal(plan.prefix, "INV");
  assert.equal(plan.counterKey, "INVOICE:TIMESTAMP:INV");
  assert.equal(plan.nextInvoiceNumber, "INV-20260929160045-001");
});
test("timestamp invoice suffix is continuous and restarts after resetting the counter", async () => {
  let sequence = 24;
  const Counter = { findOneAndUpdate: async ({ key }) => { assert.equal(key, "INVOICE:TIMESTAMP:INV"); return { sequence: ++sequence }; } };
  assert.equal(await nextInvoiceNumber({ Counter, value: "2026-09-29T10:30:45Z" }), "INV-20260929160045-025");
  sequence = 0;
  assert.equal(await nextInvoiceNumber({ Counter, value: "2026-09-29T10:31:00Z" }), "INV-20260929160100-001");
  assert.equal(await nextInvoiceNumber({ Counter, value: "2026-09-30T10:31:00Z" }), "INV-20260930160100-002");
});
test("same-second reset skips occupied invoice numbers", async () => {
  let sequence = 0;
  const Counter = { findOneAndUpdate: async () => ({ sequence: ++sequence }) };
  const used = new Set(["INV-20260929160045-001"]);
  assert.equal(await nextInvoiceNumber({ Counter, value: "2026-09-29T10:30:45Z", isNumberUsed: async number => used.has(number) }), "INV-20260929160045-002");
});
test("reset version invalidates old previews without depending on the clock", () => {
  const first = planFutureInvoiceReset({ invoice: { prefix: "INV" }, value: "2026-09-29" });
  const later = planFutureInvoiceReset({ invoice: { prefix: "INV" }, value: "2026-09-30" });
  assert.equal(first.token, later.token);
  assert.notEqual(first.token, planFutureInvoiceReset({ invoice: { prefix: "INV", resetVersion: 1 } }).token);
});
