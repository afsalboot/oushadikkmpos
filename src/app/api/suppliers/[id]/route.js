import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Purchase, Supplier } from "@/models";

const fields = (body) => ({ name: String(body.name || "").trim(), phone: String(body.phone || "").trim(), email: String(body.email || "").trim().toLowerCase(), address: String(body.address || "").trim(), taxNumber: String(body.taxNumber || "").trim() });

export async function GET(_request, { params }) { try { await requireSession("purchases.view"); await connectDb(); const { id } = await params; if (!mongoose.isValidObjectId(id)) return fail("Invalid supplier"); const supplier = await Supplier.findById(id).lean(); if (!supplier) return fail("Supplier not found", 404); const purchases = await Purchase.find({ supplierId: supplier._id }).populate("items.productId", "name sku packageType").sort({ purchasedAt: -1 }).lean(); return ok({ supplier, purchases }); } catch (error) { return apiError(error); } }
export async function PUT(request, { params }) { try { await requireSession("purchases.edit"); await connectDb(); const { id } = await params; if (!mongoose.isValidObjectId(id)) return fail("Invalid supplier"); const input = fields(await request.json()); if (!input.name) return fail("Supplier name is required"); const supplier = await Supplier.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }); if (!supplier) return fail("Supplier not found", 404); return ok(supplier); } catch (error) { return apiError(error); } }
export async function DELETE(_request, { params }) { try { await requireSession("ADMIN"); await connectDb(); const { id } = await params; if (!mongoose.isValidObjectId(id)) return fail("Invalid supplier"); const hasPurchases = await Purchase.exists({ supplierId: id }); const supplier = hasPurchases ? await Supplier.findByIdAndUpdate(id, { $set: { active: false } }) : await Supplier.findByIdAndDelete(id); if (!supplier) return fail("Supplier not found", 404); return ok({ deleted: true, archived: Boolean(hasPurchases) }); } catch (error) { return apiError(error); } }
