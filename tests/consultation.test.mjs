import test from "node:test";
import assert from "node:assert/strict";
import { consultationInput, consultationSummary } from "../src/lib/consultation.js";
import { receiptLayout } from "../src/lib/receipt-layout.js";
import { buildAccountLedger } from "../src/services/accounting.service.js";
import { Consultation } from "../src/models/index.js";
import { SETTINGS_DEFAULTS, normalizeSettings } from "../src/services/settings.service.js";
import { getEffectivePermissionObject } from "../src/services/rbac.service.js";
const doctor = { consultationFee: 200 };
const settings = { payments: { enabledMethods: ["CASH", "BANK"], bank: { requireReference: true } } };
const body = { patient: { name: "Patient", phone: "", age: "", gender: "" }, paymentMethod: "CASH" };
test("consultation defaults off and remains explicitly enabled only by Settings", () => {
  assert.equal(SETTINGS_DEFAULTS.features.consultation, false);
  assert.equal(normalizeSettings({}).features.consultation, false);
  assert.equal(normalizeSettings({ features: { consultation: true } }).features.consultation, true);
});
test("consultation accepts an unlinked patient and snapshots optional details", () => {
  const value = consultationInput(body, doctor, settings, false);
  assert.equal(value.patient.name, "Patient"); assert.equal(value.patient.age, undefined);
  assert.equal(value.consultationFee, 200); assert.equal(value.customerId, undefined);
});
test("fee overrides, disabled payments and missing bank references are rejected", () => {
  assert.throws(() => consultationInput({ ...body, consultationFee: 100 }, doctor, settings, false), /override/);
  assert.equal(consultationInput({ ...body, consultationFee: 100 }, doctor, settings, true).consultationFee, 100);
  assert.throws(() => consultationInput({ ...body, paymentMethod: "CARD" }, doctor, settings, true), /enabled/);
  assert.throws(() => consultationInput({ ...body, paymentMethod: "BANK" }, doctor, settings, true), /reference/);
  assert.throws(() => consultationInput({ ...body, consultationFee: -1 }, doctor, settings, true), /valid/);
});
test("patient fields and ages are validated", () => {
  assert.throws(() => consultationInput({ ...body, patient: { name: "" } }, doctor, settings, true), /name/);
  assert.throws(() => consultationInput({ ...body, patient: { name: "Patient", age: 131 } }, doctor, settings, true), /Age/);
  assert.throws(() => consultationInput({ ...body, patient: { name: "Patient", gender: "invalid" } }, doctor, settings, true), /gender/);
});
test("cancelled consultations are excluded from collection summary", () => {
  assert.deepEqual(consultationSummary([{ status: "COMPLETED", consultationFee: 200 }, { status: "CANCELLED", consultationFee: 300 }]), { count: 1, collection: 200, cancelled: 1 });
});
test("receipt layouts share conservative content widths and reject arbitrary CSS values", () => {
  assert.deepEqual(receiptLayout({ width: "80mm" }), { paper: 80, content: 72, logo: 62 });
  assert.deepEqual(receiptLayout({ width: "58mm" }), { paper: 58, content: 50, logo: 44 });
  assert.equal(receiptLayout({ width: "100%;color:red" }).paper, 80);
});
test("OP, request IDs and branch/day tokens have unique database indexes", () => {
  const unique = Consultation.schema.indexes().filter(([, options]) => options.unique).map(([keys]) => keys);
  assert.ok(unique.some(keys => keys.opNumber)); assert.ok(unique.some(keys => keys.requestId));
  assert.ok(unique.some(keys => keys.branchId && keys.dayKey && keys.tokenNumber));
});
test("existing staff do not gain consultation permissions and owner gets configuration access", () => {
  assert.equal(getEffectivePermissionObject({ role: "STAFF", roleId: { permissions: { sales: { view: true } } } }).consultation, undefined);
  assert.equal(getEffectivePermissionObject({ role: "ADMIN" }).doctor.manage, true);
});
test("ledger preserves consultation collection and later refund as separate movements", () => {
  const row = { _id: "op1", opNumber: "OP000001", consultationFee: 200, refundedAmount: 200, paymentMethod: "CASH", status: "CANCELLED", createdAt: "2026-09-29T10:00:00Z", cancelledAt: "2026-09-30T10:00:00Z", patient: { name: "Patient" }, doctorSnapshot: { name: "Doctor" } };
  const all = buildAccountLedger([], [], { consultations: [row] });
  assert.equal(all.movements.length, 2); assert.equal(all.summary.balance, 0);
  assert.equal(all.summary.moneyIn, 200); assert.equal(all.summary.moneyOut, 200);
  const day = buildAccountLedger([], [], { consultations: [row], dateFrom: "2026-09-30", dateTo: "2026-09-30" });
  assert.equal(day.summary.moneyIn, 0); assert.equal(day.summary.moneyOut, 200);
  assert.equal(day.movements[0].type, "CONSULTATION_REFUND");
});
