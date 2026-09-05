import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { InventoryBatch, Product, StockTransaction } from "@/models";
import { calculatePhysicalStock, deductLooseStock } from "@/services/inventory.service";

const REASONS = ["Physical Count Correction", "Damage", "Expired", "Broken Package", "Lost Stock", "Manual Correction", "Other"];

export async function POST(request, { params }) {
  let dbSession;
  try {
    const auth = await requireSession("products.stockAdjust");
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product");
    const body = await request.json();
    const direction = body.direction === "DECREASE" ? "DECREASE" : body.direction === "INCREASE" ? "INCREASE" : null;
    const quantity = Number(body.quantity);
    const reason = String(body.reason || "").trim();
    if (!direction) return fail("Select increase or decrease");
    if (!(quantity > 0)) return fail("Quantity must be greater than zero");
    if (!REASONS.includes(reason)) return fail("Select a valid adjustment reason");

    dbSession = await mongoose.startSession();
    let result;
    await dbSession.withTransaction(async () => {
      const product = await Product.findById(id).session(dbSession);
      if (!product) throw new Error("Product not found");
      const batches = await InventoryBatch.find({ productId: product._id }).sort({ expiryDate: 1, createdAt: 1 }).session(dbSession);
      const before = calculatePhysicalStock(batches);
      if (direction === "DECREASE" && quantity > before.totalBaseQuantity) throw new Error("Adjustment exceeds available stock");
      let batchId;
      if (direction === "INCREASE") {
        let batch = await InventoryBatch.findOne({ productId: product._id, batchNumber: "ADJUSTMENT" }).session(dbSession);
        if (!batch) {
          [batch] = await InventoryBatch.create([{ productId: product._id, batchNumber: "ADJUSTMENT", packageSize: product.packageSize, sealedPackages: 0, openQuantity: 0, sellingPrice: product.packageSellingPrice }], { session: dbSession, ordered: true });
        }
        const total = Number(batch.sealedPackages) * product.packageSize + Number(batch.openQuantity) + quantity;
        batch.sealedPackages = Math.floor(total / product.packageSize);
        batch.openQuantity = total % product.packageSize;
        await batch.save({ session: dbSession });
        batchId = batch._id;
      } else {
        let remaining = quantity;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = Number(batch.sealedPackages) * Number(batch.packageSize) + Number(batch.openQuantity);
          const used = Math.min(available, remaining);
          if (!used) continue;
          batch.set(deductLooseStock(batch, used));
          await batch.save({ session: dbSession });
          batchId ||= batch._id;
          remaining -= used;
        }
      }
      const signed = direction === "INCREASE" ? quantity : -quantity;
      const newStock = before.totalBaseQuantity + signed;
      await StockTransaction.create([{ productId: product._id, batchId, type: reason === "Damage" ? "DAMAGE" : reason === "Expired" ? "EXPIRED" : "STOCK_ADJUSTMENT", baseQuantity: signed, unit: product.baseUnit, direction: signed > 0 ? "IN" : "OUT", previousStock: before.totalBaseQuantity, newStock, referenceType: "ADJUSTMENT", reason, note: String(body.notes || "").trim(), actorId: new mongoose.Types.ObjectId(auth.sub) }], { session: dbSession, ordered: true });
      result = { previousStock: before.totalBaseQuantity, newStock, quantity: signed, unit: product.baseUnit };
    });
    return ok(result);
  } catch (error) {
    return apiError(error);
  } finally {
    if (dbSession) await dbSession.endSession();
  }
}
