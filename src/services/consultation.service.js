import mongoose from "mongoose";
import { Consultation, Doctor, DocumentCounter, Settings, Customer, AuditLog } from "@/models";
import { normalizeSettings } from "@/services/settings.service";
import { dashboardToday, dashboardRange } from "@/lib/dashboard-dates";
import { CONSULTATION_BRANCH, consultationInput, consultationPatient, consultationMoney } from "@/lib/consultation";

const reject = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
export const consultationAllowed = (actor, action) => actor.role === "ADMIN" || actor.permissions.includes(`consultation.${action}`);
export async function requireConsultation() {
  const settings = normalizeSettings(await Settings.findOne({ key: "global" }).lean() || {});
  if (settings.features?.consultation !== true) reject("Consultation is disabled in Settings", 403);
  return settings;
}
const validId = (id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
export async function listConsultations(params) {
  await requireConsultation();
  let dates;
  try { dates = dashboardRange("custom", params.get("from") || dashboardToday(), params.get("to") || dashboardToday()); } catch (error) { reject(error.message); }
  const filter = { branchId: CONSULTATION_BRANCH, deletedAt: null, createdAt: { $gte: dates.start, $lte: dates.end } };
  const doctor = params.get("doctor"), status = params.get("status"), method = params.get("paymentMethod");
  if (doctor) { if (!validId(doctor)) reject("Invalid doctor"); filter.doctorId = new mongoose.Types.ObjectId(doctor); }
  if (status) { if (!["COMPLETED", "CANCELLED"].includes(status)) reject("Invalid status"); filter.status = status; }
  if (method) { if (!["CASH", "UPI", "BANK"].includes(method)) reject("Invalid payment method"); filter.paymentMethod = method; }
  const search = (params.get("search") || "").trim().slice(0, 100);
  if (search) { const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); filter.$or = [{ opNumber: regex }, { "patient.name": regex }, { "patient.phone": regex }]; }
  const page = Math.max(1, Number(params.get("page")) || 1), limit = 25;
  const [rows, total, summary] = await Promise.all([
    Consultation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Consultation.countDocuments(filter),
    Consultation.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$consultationFee" } } }]),
  ]);
  const completed = summary.find((row) => row._id === "COMPLETED");
  return { rows, pagination: { page, pages: Math.max(1, Math.ceil(total / limit)), total }, summary: { count: completed?.count || 0, collection: consultationMoney(completed?.amount || 0), cancelled: summary.find((row) => row._id === "CANCELLED")?.count || 0 } };
}
export async function getConsultation(id) {
  await requireConsultation();
  if (!validId(id)) reject("Invalid consultation");
  const row = await Consultation.findById(id).lean();
  if (!row) reject("Consultation not found", 404);
  return row;
}
export async function createConsultation(body, actor) {
  await requireConsultation();
  if (!validId(body.doctorId)) reject("Select a doctor");
  if (typeof body.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.requestId)) reject("Invalid request ID");
  const existing = await Consultation.findOne({ requestId: body.requestId, createdBy: actor.sub }).lean();
  if (existing) return existing;
  const issuedAt = new Date(), dayKey = dashboardToday(issuedAt), tokenKey = `consultation-token:${CONSULTATION_BRANCH}:${dayKey}`;
  await Promise.all([Consultation.init(), Doctor.init(), DocumentCounter.init()]);
  for (const key of ["consultation-op", tokenKey]) {
    try { await DocumentCounter.updateOne({ key }, { $setOnInsert: { sequence: 0 } }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
  }
  try {
    return await mongoose.connection.transaction(async (session) => {
      const settings = await Settings.findOneAndUpdate({ key: "global", "features.consultation": true }, { $inc: { consultationWriteVersion: 1 } }, { session, returnDocument: "after" }).lean();
      if (!settings) reject("Consultation is disabled in Settings", 403);
      const doctor = await Doctor.findOneAndUpdate({ _id: body.doctorId, active: true }, { $inc: { revision: 1 } }, { session, returnDocument: "after" }).lean();
      if (!doctor) reject("Select an active doctor");
      let values;
      try { values = consultationInput(body, doctor, normalizeSettings(settings), consultationAllowed(actor, "overrideFee")); } catch (error) { reject(error.message); }
      let customerId = null;
      if (body.customerId) {
        if (actor.role !== "ADMIN" && !actor.permissions.includes("customers.view")) reject("You cannot link customers", 403);
        if (!validId(body.customerId)) reject("Invalid customer");
        const customer = await Customer.findOne({ _id: body.customerId, active: { $ne: false } }).session(session).lean();
        if (!customer) reject("Customer is unavailable");
        customerId = customer._id;
      }
      const op = await DocumentCounter.findOneAndUpdate({ key: "consultation-op" }, { $inc: { sequence: 1 } }, { session, returnDocument: "after" });
      const token = await DocumentCounter.findOneAndUpdate({ key: tokenKey }, { $inc: { sequence: 1 } }, { session, returnDocument: "after" });
      const [row] = await Consultation.create([{ ...values, createdAt: issuedAt, branchId: CONSULTATION_BRANCH, dayKey, requestId: body.requestId, opNumber: `OP${String(op.sequence).padStart(6, "0")}`, tokenNumber: token.sequence, customerId, doctorId: doctor._id, doctorSnapshot: { name: doctor.name, qualification: doctor.qualification }, storeSnapshot: settings.store, receiptSnapshot: settings.receipt, createdBy: actor.sub, creatorSnapshot: { name: actor.name } }], { session });
      await AuditLog.create([{ actorId: actor.sub, action: "CONSULTATION_CREATED", module: "consultation", targetType: "Consultation", targetId: row._id, description: `Created ${row.opNumber}` }], { session });
      return row.toObject();
    });
  } catch (error) {
    if (error.code === 11000) { const previous = await Consultation.findOne({ requestId: body.requestId, createdBy: actor.sub }).lean(); if (previous) return previous; }
    throw error;
  }
}
export async function updateConsultation(id, body, actor) {
  if (!consultationAllowed(actor, "edit")) reject("You cannot update consultations", 403);
  await requireConsultation();
  if (!validId(id) || !validId(body.doctorId)) reject("Invalid consultation or doctor");
  if (Object.keys(body).some(key => !["patient", "doctorId"].includes(key))) reject("Only patient and doctor details can be updated");
  let patient;
  try { patient = consultationPatient(body); } catch (error) { reject(error.message); }
  return mongoose.connection.transaction(async (session) => {
    const settings = await Settings.findOneAndUpdate({ key: "global", "features.consultation": true }, { $inc: { consultationWriteVersion: 1 } }, { session, returnDocument: "after" });
    if (!settings) reject("Consultation is disabled", 403);
    const row = await Consultation.findById(id).session(session);
    if (!row || row.deletedAt) reject("Consultation not found", 404);
    if (row.status !== "COMPLETED") reject("Cancelled consultations cannot be updated");
    const before = { patient: row.toObject().patient, doctorId: row.doctorId, doctorSnapshot: row.toObject().doctorSnapshot };
    if (String(row.doctorId) !== body.doctorId) {
      const doctor = await Doctor.findOneAndUpdate({ _id: body.doctorId, active: true }, { $inc: { revision: 1 } }, { session, returnDocument: "after" }).lean();
      if (!doctor) reject("Select an active doctor");
      row.doctorId = doctor._id;
      row.doctorSnapshot = { name: doctor.name, qualification: doctor.qualification };
    }
    row.patient = patient;
    await row.save({ session });
    await AuditLog.create([{ actorId: actor.sub, action: "CONSULTATION_UPDATED", module: "consultation", targetType: "Consultation", targetId: row._id, description: `Updated ${row.opNumber}`, metadata: { before, after: { patient, doctorId: row.doctorId, doctorSnapshot: row.toObject().doctorSnapshot } } }], { session });
    return row.toObject();
  });
}
export async function deleteConsultation(id, body, actor) {
  if (!consultationAllowed(actor, "delete")) reject("You cannot delete consultations", 403);
  await requireConsultation();
  if (!validId(id)) reject("Invalid consultation");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) reject("Deletion reason is required");
  return mongoose.connection.transaction(async (session) => {
    const settings = await Settings.findOneAndUpdate({ key: "global", "features.consultation": true }, { $inc: { consultationWriteVersion: 1 } }, { session, returnDocument: "after" });
    if (!settings) reject("Consultation is disabled", 403);
    const row = await Consultation.findById(id).session(session);
    if (!row) reject("Consultation not found", 404);
    if (row.deletedAt) return { deleted: true };
    if (row.status !== "CANCELLED") reject("Cancel and refund the consultation before deleting it");
    if (Number(row.refundedAmount || 0) !== Number(row.consultationFee)) reject("The consultation refund must be completed before deletion");
    row.deletedAt = new Date(); row.deletedBy = actor.sub; row.deletionReason = reason;
    await row.save({ session });
    await AuditLog.create([{ actorId: actor.sub, action: "CONSULTATION_DELETED", module: "consultation", targetType: "Consultation", targetId: row._id, description: `Removed ${row.opNumber} from the consultation list`, metadata: { reason, retainedFinancialHistory: true } }], { session });
    return { deleted: true };
  });
}
export async function cancelConsultation(id, body, actor) {
  await requireConsultation();
  if (!validId(id)) reject("Invalid consultation");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) reject("Cancellation reason is required");
  return mongoose.connection.transaction(async (session) => {
    const settings = await Settings.findOneAndUpdate({ key: "global", "features.consultation": true }, { $inc: { consultationWriteVersion: 1 } }, { session, returnDocument: "after" });
    if (!settings) reject("Consultation is disabled", 403);
    const row = await Consultation.findById(id).session(session);
    if (!row) reject("Consultation not found", 404);
    if (row.status === "CANCELLED") return row.toObject();
    if (row.consultationFee > 0 && body.refundConfirmed !== true) reject("Confirm that the collected fee has been refunded before cancelling");
    row.status = "CANCELLED"; row.cancelledAt = new Date(); row.cancelledBy = actor.sub; row.cancellationReason = reason;
    row.refundedAmount = row.consultationFee; row.refundReference = String(body.refundReference || "").trim().slice(0, 120);
    await row.save({ session });
    await AuditLog.create([{ actorId: actor.sub, action: "CONSULTATION_CANCELLED", module: "consultation", targetType: "Consultation", targetId: row._id, description: `Cancelled ${row.opNumber}; refund confirmed`, metadata: { reason, refundedAmount: row.refundedAmount, paymentMethod: row.paymentMethod, refundReference: row.refundReference } }], { session });
    return row.toObject();
  });
}
