import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeSettings } from "../src/services/settings.service.js";
import { dashboardToday, dashboardRange } from "../src/lib/dashboard-dates.js";
import { CONSULTATION_BRANCH, consultationInput, consultationMoney } from "../src/lib/consultation.js";

const source = (await readFile(new URL("../src/services/consultation.service.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
const actor = { sub: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "ADMIN", permissions: [], name: "Reception" };
const body = { doctorId: "bbbbbbbbbbbbbbbbbbbbbbbb", requestId: "12345678-1234-1234-1234-123456789abc", patient: { name: "Patient" }, paymentMethod: "CASH" };
function harness({ enabled = true, lockEnabled = true, existing = null, inactive = false, cancelled = false } = {}) {
  const writes = [], session = {}, settings = normalizeSettings({ features: { consultation: enabled } });
  const lean = value => ({ lean: async () => value });
  const row = { _id: "cccccccccccccccccccccccc", opNumber: "OP000001", status: cancelled ? "CANCELLED" : "COMPLETED", consultationFee: 200, paymentMethod: "CASH", toObject() { return { ...this }; }, async save(options) { writes.push({ type: "save", options }); } };
  const deps = {
    normalizeSettings, dashboardToday, dashboardRange, CONSULTATION_BRANCH, consultationInput, consultationMoney,
    mongoose: { connection: { transaction: async fn => fn(session) } },
    Settings: { findOne: () => lean(settings), findOneAndUpdate: () => { const value = lockEnabled ? settings : null; return { ...lean(value), then: resolve => resolve(value) }; } },
    Doctor: { init: async () => {}, findOneAndUpdate: () => lean(inactive ? null : { _id: body.doctorId, name: "Doctor", qualification: "BAMS", consultationFee: 200 }) },
    Customer: {},
    DocumentCounter: { init: async () => {}, updateOne: async () => {}, findOneAndUpdate: async (filter, update, options) => { writes.push({ type: "counter", filter, options }); return { sequence: 1 }; } },
    Consultation: { init: async () => {}, findOne: () => lean(existing), findById: () => ({ session: async () => row }), create: async (rows, options) => { writes.push({ type: "create", rows, options }); return [{ ...rows[0], _id: row._id, toObject() { return { ...this }; } }]; } },
    AuditLog: { create: async (rows, options) => { writes.push({ type: "audit", rows, options }); } },
  };
  const service = new Function(...Object.keys(deps), `${source}; return {createConsultation,cancelConsultation};`)(...Object.values(deps));
  return { service, writes, session, row };
}
test("disabled feature rejects creation before writes, including a concurrent settings toggle", async () => {
  for (const options of [{ enabled: false }, { lockEnabled: false }]) {
    const h = harness(options);
    await assert.rejects(h.service.createConsultation(body, actor), error => error.status === 403);
    assert.equal(h.writes.length, 0);
  }
});
test("inactive doctor cannot issue a ticket or consume numbers", async () => {
  const h = harness({ inactive: true });
  await assert.rejects(h.service.createConsultation(body, actor), /active doctor/);
  assert.equal(h.writes.length, 0);
});
test("ticket numbers, snapshots and audit share one database transaction", async () => {
  const h = harness(), result = await h.service.createConsultation(body, actor);
  assert.equal(result.opNumber, "OP000001"); assert.equal(result.tokenNumber, 1);
  assert.equal(result.dayKey, dashboardToday(result.createdAt));
  assert.equal(result.doctorSnapshot.name, "Doctor"); assert.equal(result.patient.name, "Patient");
  assert.deepEqual(h.writes.map(write => write.type), ["counter", "counter", "create", "audit"]);
  assert.ok(h.writes.every(write => write.options.session === h.session));
});
test("retry of an issued request returns its ticket without new counters or payments", async () => {
  const existing = { opNumber: "OP000003" }, h = harness({ existing });
  assert.equal(await h.service.createConsultation(body, actor), existing);
  assert.equal(h.writes.length, 0);
});
test("cancellation requires explicit refund confirmation and records actor plus audit", async () => {
  const h = harness();
  await assert.rejects(h.service.cancelConsultation(h.row._id, { reason: "Patient left" }, actor), /refunded/);
  assert.equal(h.writes.length, 0);
  const result = await h.service.cancelConsultation(h.row._id, { reason: "Patient left", refundConfirmed: true }, actor);
  assert.equal(result.status, "CANCELLED"); assert.equal(result.refundedAmount, 200);
  assert.equal(result.cancelledBy, actor.sub); assert.equal(result.cancellationReason, "Patient left");
  assert.ok(h.writes.every(write => write.options.session === h.session));
  assert.deepEqual(h.writes.map(write => write.type), ["save", "audit"]);
});
test("retrying cancellation does not record another refund", async () => {
  const h = harness({ cancelled: true });
  await h.service.cancelConsultation(h.row._id, { reason: "Patient left", refundConfirmed: true }, actor);
  assert.equal(h.writes.length, 0);
});
