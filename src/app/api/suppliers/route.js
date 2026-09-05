import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Purchase, Supplier } from "@/models";

const fields = (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), phone: String(body.phone || "").trim(), email: String(body.email || "").trim().toLowerCase(), address: String(body.address || "").trim(), taxNumber: String(body.taxNumber || "").trim() });
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(request) {
  try {
    await requireSession("purchases.view"); await connectDb();
    const query = new URL(request.url).searchParams.get("q")?.trim();
    const filter = { active: { $ne: false } };
    if (query) { const safeQuery = escapeRegex(query); filter.$or = [{ name: { $regex: safeQuery, $options: "i" } }, { code: { $regex: safeQuery, $options: "i" } }, { phone: { $regex: safeQuery, $options: "i" } }, { taxNumber: { $regex: safeQuery, $options: "i" } }]; }
    const suppliers = await Supplier.find(filter).sort({ updatedAt: -1 }).lean();
    const totals = suppliers.length ? await Purchase.aggregate([{ $match: { supplierId: { $in: suppliers.map((supplier) => supplier._id) }, purchaseStatus: { $ne: "CANCELLED" } } }, { $group: { _id: "$supplierId", purchaseCount: { $sum: 1 }, totalPurchased: { $sum: "$total" }, outstanding: { $sum: "$balanceDue" }, lastPurchaseAt: { $max: "$purchasedAt" } } }]) : [];
    const byId = new Map(totals.map((entry) => [String(entry._id), entry]));
    return ok(suppliers.map((supplier) => ({ ...supplier, purchaseCount: byId.get(String(supplier._id))?.purchaseCount || 0, totalPurchased: byId.get(String(supplier._id))?.totalPurchased || 0, outstanding: byId.get(String(supplier._id))?.outstanding || 0, lastPurchaseAt: byId.get(String(supplier._id))?.lastPurchaseAt || null })));
  } catch (error) { return apiError(error); }
}

export async function POST(request) {
  try { await requireSession("purchases.create"); await connectDb(); const input = fields(await request.json()); if (!input.name) return fail("Supplier name is required"); return ok(await Supplier.create(input), 201); } catch (error) { return apiError(error); }
}
