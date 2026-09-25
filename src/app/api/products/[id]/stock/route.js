import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { InventoryBatch, Product, StockTransaction } from "@/models";
import { calculatePhysicalStock } from "@/services/inventory.service";
import { planFullStockAdjustment } from "@/lib/full-stock-adjustment";

export async function POST(request, { params }) {
  let dbSession;
  try {
    const session = await requireSession("products.stockAdjust");
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product");
    const product = await Product.findById(id);
    if (!product) return fail("Product not found", 404);
    const body = await request.json();
    const fullStockOnly = body.fullStockOnly === true;
    const sealedPackages = Number(body.sealedPackages);
    const openQuantity = Number(body.openQuantity);
    if (!Number.isSafeInteger(sealedPackages) || sealedPackages < 0) return fail("Full stock must be a non-negative whole number");
    const reason = String(body.reason || "Physical Count Correction").trim();
    if (fullStockOnly && !["Physical Count Correction", "Damage", "Expired", "Broken Package", "Lost Stock", "Manual Correction", "Other"].includes(reason)) return fail("Select a valid adjustment reason");
    if (fullStockOnly && (!Number.isSafeInteger(body.expectedSealedPackages) || body.expectedSealedPackages < 0)) return fail("Refresh the current stock before adjusting it");
    const countBased=product.loosePricingMethod==="count_based";
    if(!fullStockOnly&&countBased&&(!Number.isInteger(openQuantity)||openQuantity<0))return fail(`${product.looseUnit||"Loose"} quantity must be a non-negative whole number`);
    if (!fullStockOnly&&!countBased&&(!Number.isFinite(openQuantity) || openQuantity < 0 || openQuantity >= product.packageSize)) return fail(`Open quantity must be between 0 and less than ${product.packageSize} ${product.baseUnit}`);

    dbSession=await mongoose.startSession();let result;
    await dbSession.withTransaction(async()=>{
      const batches = await InventoryBatch.find({ productId: product._id }).sort({ expiryDate: 1, createdAt: 1 }).session(dbSession).lean();
      const before = calculatePhysicalStock(batches,product);
      if (fullStockOnly) {
        if (before.sealedPackages !== body.expectedSealedPackages) throw new Error("Stock changed since this form was opened. Close and reopen it before adjusting stock.");
        const plan = planFullStockAdjustment(batches, sealedPackages);
        if (plan.difference === 0) { result = before; return; }
        let batchId;
        if (plan.additions > 0) {
          const batch = await InventoryBatch.findOneAndUpdate(
            { productId: product._id, batchNumber: "MANUAL-STOCK" },
            { $inc: { sealedPackages: plan.additions }, $setOnInsert: { packageSize: product.packageSize, openQuantity: 0, sellingPrice: product.packageSellingPrice } },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true, session: dbSession },
          );
          batchId = batch._id;
        }
        for (const deduction of plan.deductions) {
          await InventoryBatch.updateOne({ _id: deduction.batchId }, { $inc: { sealedPackages: -deduction.quantity } }, { session: dbSession });
          batchId ||= deduction.batchId;
        }
        const afterBatches = await InventoryBatch.find({ productId: product._id }).session(dbSession).lean();
        const after = calculatePhysicalStock(afterBatches, product);
        await StockTransaction.create([{
          productId: product._id, batchId,
          type: reason === "Damage" ? "DAMAGE" : reason === "Expired" ? "EXPIRED" : "STOCK_ADJUSTMENT",
          packageQuantity: plan.difference, baseQuantity: after.totalBaseQuantity - before.totalBaseQuantity,
          looseQuantity: 0, unit: countBased ? product.looseUnit : product.baseUnit,
          direction: plan.difference > 0 ? "IN" : "OUT",
          previousStock: before.totalBaseQuantity, newStock: after.totalBaseQuantity,
          referenceType: "ADJUSTMENT", reason, note: String(body.note || "Full stock correction").trim(),
          actorId: new mongoose.Types.ObjectId(session.sub),
        }], { session: dbSession, ordered: true });
        result = after;
        return;
      }
      await InventoryBatch.updateMany({ productId: product._id }, { $set: { sealedPackages: 0, openQuantity: 0 } },{session:dbSession});
      const batch = await InventoryBatch.findOneAndUpdate(
        { productId: product._id, batchNumber: "MANUAL-STOCK" },
        { $set: { packageSize: product.packageSize, sealedPackages, openQuantity, sellingPrice: product.packageSellingPrice } },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true,session:dbSession },
      );
      const afterBaseQuantity = countBased?openQuantity:sealedPackages * product.packageSize + openQuantity;
      await StockTransaction.create([{
        productId: product._id,batchId: batch._id,type: "ADJUSTMENT",baseQuantity: afterBaseQuantity - before.totalBaseQuantity,packageQuantity: sealedPackages - before.sealedPackages,
        looseQuantity:countBased?openQuantity-before.openQuantity:0,looseUnit:countBased?product.looseUnit:product.baseUnit,unit: countBased?product.looseUnit:product.baseUnit,
        direction: afterBaseQuantity >= before.totalBaseQuantity ? "IN" : "OUT",previousStock: before.totalBaseQuantity,newStock: afterBaseQuantity,reason: "Physical Count Correction",
        note: String(body.note || "Manual stock set").trim(),actorId: new mongoose.Types.ObjectId(session.sub),
      }],{session:dbSession,ordered:true});
      result={ sealedPackages, openQuantity, totalBaseQuantity: afterBaseQuantity,hasStock:sealedPackages>0||openQuantity>0 };
    });
    return ok(result);
  } catch (error) {
    return apiError(error);
  } finally {if(dbSession)await dbSession.endSession();}
}
