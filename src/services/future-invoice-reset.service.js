import mongoose from "mongoose";
import { AuditLog, DocumentCounter, FiscalGuard, Settings } from "../models/index.js";
import { planFutureInvoiceReset } from "../lib/future-invoice-reset.js";
import { invalidateSettingsCache } from "./settings.service.js";

async function loadPlan(session) {
  // Keep transaction operations sequential, matching checkout's issuance guard.
  const settings = await Settings.findOne({ key: "global" }).session(session || null).lean();
  const plan = planFutureInvoiceReset({ invoice: settings?.invoice });
  return { settings, plan };
}

export async function previewFutureInvoiceReset() {
  const { plan } = await loadPlan();
  return { prefix: plan.prefix, nextInvoiceNumber: plan.nextInvoiceNumber, token: plan.token };
}

export async function resetFutureInvoiceNumbers({ token, confirmation }, actor) {
  if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
  if (confirmation !== "RESET FUTURE INVOICES" || !/^[a-f0-9]{64}$/.test(String(token || ""))) {
    throw Object.assign(new Error("Preview and confirm the invoice reset first."), { status: 400 });
  }
  await Promise.all([DocumentCounter.init(), FiscalGuard.init()]);
  let result;
  await mongoose.connection.transaction(async (session) => {
    await FiscalGuard.findOneAndUpdate({ key: "issuance" }, { $inc: { revision: 1 } }, { upsert: true, session });
    const previous = await AuditLog.findOne({ action: "FUTURE_INVOICE_NUMBERS_RESET", "metadata.token": token }).session(session).lean();
    if (previous) { result = previous.metadata.result; return; }
    const { settings, plan } = await loadPlan(session);
    if (plan.token !== token) throw Object.assign(new Error("Invoice settings changed. Preview the reset again."), { status: 409 });
    // Only the counter for future timestamped invoices changes; sales are untouched.
    await DocumentCounter.findOneAndUpdate({ key: plan.counterKey }, { $set: { sequence: 0 } }, { upsert: true, session });
    await Settings.updateOne({ key: "global" }, { $set: {
      "invoice.prefix": plan.prefix,
      "invoice.wholesalePrefix": plan.prefix,
      "invoice.nextNumber": 1,
      "invoice.resetVersion": plan.resetVersion,
      "invoice.format": "{PREFIX}-{DATETIME}-{NUMBER}",
    } }, { upsert: true, session });
    result = { prefix: plan.prefix, nextInvoiceNumber: plan.nextInvoiceNumber };
    await AuditLog.create([{
      actorId: actor.sub, action: "FUTURE_INVOICE_NUMBERS_RESET", module: "settings", targetType: "Settings", targetId: settings?._id,
      description: `Reset future invoice numbering. Next invoice: ${plan.nextInvoiceNumber}`,
      metadata: { token, result, previousInvoiceSettings: settings?.invoice || {}, counterKey: plan.counterKey },
    }], { session });
  });
  invalidateSettingsCache();
  return result;
}
