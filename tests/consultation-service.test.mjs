import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeSettings } from "../src/services/settings.service.js";
import { dashboardToday, dashboardRange } from "../src/lib/dashboard-dates.js";
import { CONSULTATION_BRANCH, consultationInput, consultationPatient, consultationMoney, consultationTokenNumber } from "../src/lib/consultation.js";

const source = (await readFile(new URL("../src/services/consultation.service.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
const actor = { sub: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "ADMIN", permissions: [], name: "Reception" };
const body = { doctorId: "bbbbbbbbbbbbbbbbbbbbbbbb", requestId: "12345678-1234-1234-1234-123456789abc", patient: { name: "Patient" }, paymentMethod: "CASH" };
function harness({ enabled = true, lockEnabled = true, existing = null, inactive = false, cancelled = false } = {}) {
  const writes = [], session = {}, settings = normalizeSettings({ features: { consultation: enabled } });
  const counters = new Map();
  const lean = value => ({ lean: async () => value });
  const row = { _id: "cccccccccccccccccccccccc", opNumber: "OP000001", status: cancelled ? "CANCELLED" : "COMPLETED", consultationFee: 200, paymentMethod: "CASH", toObject() { return { ...this }; }, async save(options) { writes.push({ type: "save", options }); } };
  const deps = {
    normalizeSettings, dashboardToday, dashboardRange, CONSULTATION_BRANCH, consultationInput, consultationPatient, consultationMoney,
    mongoose: { connection: { transaction: async fn => fn(session) } },
    Settings: { findOne: () => lean(settings), findOneAndUpdate: () => { const value = lockEnabled ? settings : null; return { ...lean(value), then: resolve => resolve(value) }; } },
    Doctor: { init: async () => {}, findOneAndUpdate: () => lean(inactive ? null : { _id: body.doctorId, name: "Doctor", qualification: "BAMS", consultationFee: 200 }) },
    Customer: {},
    DocumentCounter: { init: async () => {}, updateOne: async (filter, update, options) => {
      const counter = counters.get(filter.key) || { _id: "eeeeeeeeeeeeeeeeeeeeeeee", sequence: 0 };
      if (update.$set) { Object.assign(counter, update.$set); writes.push({ type: "counterUpdate", filter, options }); }
      counters.set(filter.key, counter);
    }, findOneAndUpdate: async (filter, update, options) => {
      const counter = counters.get(filter.key) || { _id: "eeeeeeeeeeeeeeeeeeeeeeee", sequence: 0 };
      counter.sequence += update.$inc?.sequence || 0;
      counters.set(filter.key, counter); writes.push({ type: "counter", filter, options }); return { ...counter };
    } },
    Consultation: { init: async () => {}, findOne: () => lean(existing), findById: () => ({ session: async () => row }), create: async (rows, options) => { writes.push({ type: "create", rows, options }); return [{ ...rows[0], _id: row._id, toObject() { return { ...this }; } }]; } },
    AuditLog: { findOne: filter => ({ session: () => lean(writes.flatMap(write => write.rows || []).find(row => row.action === filter.action && row.metadata?.requestId === filter["metadata.requestId"])) }), create: async (rows, options) => { writes.push({ type: "audit", rows, options }); } },
  };
  const service = new Function(...Object.keys(deps), `${source}; return {createConsultation,cancelConsultation,updateConsultation,deleteConsultation,resetConsultationTokens};`)(...Object.values(deps));
  return { service, writes, session, row, counters };
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

test("updates correct patient and doctor snapshots without changing collected payment", async () => {
  const h = harness();
  h.row.patient = { name: "Old name" }; h.row.doctorId = "dddddddddddddddddddddddd";
  const result = await h.service.updateConsultation(h.row._id, { patient: { name: "Correct name", phone: "1234567890", age: 30 }, doctorId: body.doctorId }, actor);
  assert.equal(result.patient.name, "Correct name");
  assert.equal(result.doctorSnapshot.name, "Doctor");
  assert.equal(result.consultationFee, 200); assert.equal(result.paymentMethod, "CASH");
  assert.equal(result.opNumber, "OP000001");
  assert.deepEqual(h.writes.map(write => write.type), ["save", "audit"]);
  assert.ok(h.writes.every(write => write.options.session === h.session));
  assert.equal(h.writes[1].rows[0].metadata.before.patient.name, "Old name");
});

test("updates reject invalid patient, financial edits, inactive doctor and cancelled tickets", async () => {
  const h = harness(), update = { patient: { name: "Patient" }, doctorId: body.doctorId };
  await assert.rejects(h.service.updateConsultation(h.row._id, { ...update, patient: { name: "" } }, actor), /Patient name/);
  await assert.rejects(h.service.updateConsultation(h.row._id, { ...update, consultationFee: 1 }, actor), /Only patient/);
  const inactive = harness({ inactive: true });
  await assert.rejects(inactive.service.updateConsultation(inactive.row._id, update, actor), /active doctor/);
  const cancelled = harness({ cancelled: true });
  await assert.rejects(cancelled.service.updateConsultation(cancelled.row._id, update, actor), /Cancelled/);
  assert.equal(h.writes.length + inactive.writes.length + cancelled.writes.length, 0);
});

test("delete requires completed cancellation and retains payment and refund records", async () => {
  const h = harness();
  await assert.rejects(h.service.deleteConsultation(h.row._id, { reason: "Duplicate" }, actor), /Cancel and refund/);
  h.row.status = "CANCELLED";
  await assert.rejects(h.service.deleteConsultation(h.row._id, { reason: "Duplicate" }, actor), /refund must be completed/);
  h.row.refundedAmount = 200;
  await assert.rejects(h.service.deleteConsultation(h.row._id, { reason: " " }, actor), /reason/);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(await h.service.deleteConsultation(h.row._id, { reason: "Duplicate" }, actor), { deleted: true });
  assert.ok(h.row.deletedAt instanceof Date); assert.equal(h.row.deletedBy, actor.sub);
  assert.equal(h.row.consultationFee, 200); assert.equal(h.row.refundedAmount, 200);
  assert.deepEqual(h.writes.map(write => write.type), ["save", "audit"]);
  assert.ok(h.writes.every(write => write.options.session === h.session));
  await h.service.deleteConsultation(h.row._id, { reason: "Retry" }, actor);
  assert.equal(h.writes.length, 2);
});

test("update and delete require explicit permissions and the enabled feature", async () => {
  for (const method of ["updateConsultation", "deleteConsultation"]) {
    const payload = { patient: { name: "Patient" }, doctorId: body.doctorId, reason: "Duplicate" };
    const h = harness();
    await assert.rejects(h.service[method](h.row._id, payload, { ...actor, role: "CASHIER", permissions: ["consultation.view"] }), error => error.status === 403);
    assert.equal(h.writes.length, 0);
    for (const options of [{ enabled: false }, { lockEnabled: false }]) {
      const disabled = harness(options);
      const input = method === "updateConsultation" ? { patient: payload.patient, doctorId: payload.doctorId } : { reason: payload.reason };
      await assert.rejects(disabled.service[method](disabled.row._id, input, actor), error => error.status === 403);
      assert.equal(disabled.writes.length, 0);
    }
  }
});

const resetRequest = () => ({ confirmed: true, dayKey: dashboardToday(), requestId: "22345678-1234-1234-1234-123456789abc" });
test("reset restarts today's displayed tokens while preserving OP and internal uniqueness", async () => {
  const h = harness();
  const first = await h.service.createConsultation(body, actor);
  const second = await h.service.createConsultation({ ...body, requestId: "32345678-1234-1234-1234-123456789abc" }, actor);
  assert.equal(consultationTokenNumber(second), 2);
  const beforeReset = h.writes.length;
  await h.service.resetConsultationTokens(resetRequest(), actor);
  assert.deepEqual(h.writes.slice(beforeReset).map(write => write.type), ["counter", "counterUpdate", "audit"]);
  assert.ok(h.writes.slice(beforeReset).every(write => write.options.session === h.session));
  const next = await h.service.createConsultation({ ...body, requestId: "42345678-1234-1234-1234-123456789abc" }, actor);
  assert.equal(consultationTokenNumber(next), 1);
  assert.equal(next.tokenNumber, 3); assert.equal(next.opNumber, "OP000003");
  assert.equal(consultationTokenNumber(first), 1); assert.equal(consultationTokenNumber(second), 2);
  assert.equal(consultationTokenNumber({ tokenNumber: 9 }), 9);
});
test("retried reset does not reset tokens issued after the first request", async () => {
  const h = harness(), request = resetRequest();
  await h.service.resetConsultationTokens(request, actor);
  await h.service.createConsultation(body, actor);
  const beforeRetry = h.writes.length;
  assert.equal((await h.service.resetConsultationTokens(request, actor)).alreadyReset, true);
  assert.equal(h.writes.length, beforeRetry);
  const next = await h.service.createConsultation(body, actor);
  assert.equal(consultationTokenNumber(next), 2);
});
test("reset rejects staff, missing confirmation, stale dates and disabled module", async () => {
  const h = harness();
  await assert.rejects(h.service.resetConsultationTokens(resetRequest(), { ...actor, role: "CASHIER" }), error => error.status === 403);
  await assert.rejects(h.service.resetConsultationTokens({ ...resetRequest(), confirmed: false }, actor), /Confirm/);
  await assert.rejects(h.service.resetConsultationTokens({ ...resetRequest(), dayKey: "2000-01-01" }, actor), /date changed/);
  assert.equal(h.writes.length, 0);
  for (const options of [{ enabled: false }, { lockEnabled: false }]) {
    const disabled = harness(options);
    await assert.rejects(disabled.service.resetConsultationTokens(resetRequest(), actor), error => error.status === 403);
    assert.equal(disabled.writes.length, 0);
  }
});
test("reset affects only today's token counter", async () => {
  const h = harness();
  h.counters.set("consultation-token:MAIN:2000-01-01", { sequence: 8, tokenResetOffset: 3 });
  h.counters.set("consultation-op", { sequence: 100 });
  await h.service.resetConsultationTokens(resetRequest(), actor);
  assert.deepEqual(h.counters.get("consultation-token:MAIN:2000-01-01"), { sequence: 8, tokenResetOffset: 3 });
  assert.equal(h.counters.get("consultation-op").sequence, 100);
});
