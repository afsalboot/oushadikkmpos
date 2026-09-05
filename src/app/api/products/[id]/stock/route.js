import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { InventoryBatch, Product, StockTransaction } from "@/models";
import { calculatePhysicalStock } from "@/services/inventory.service";

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
    const sealedPackages = Number(body.sealedPackages);
    const openQuantity = Number(body.openQuantity);
    if (!Number.isInteger(sealedPackages) || sealedPackages < 0) return fail("Sealed packages must be a non-negative whole number");
    const countBased=product.loosePricingMethod==="count_based";
    if(countBased&&(!Number.isInteger(openQuantity)||openQuantity<0))return fail(`${product.looseUnit||"Loose"} quantity must be a non-negative whole number`);
    if (!countBased&&(!Number.isFinite(openQuantity) || openQuantity < 0 || openQuantity >= product.packageSize)) return fail(`Open quantity must be between 0 and less than ${product.packageSize} ${product.baseUnit}`);

    dbSession=await mongoose.startSession();let result;
    await dbSession.withTransaction(async()=>{
      const batches = await InventoryBatch.find({ productId: product._id }).session(dbSession).lean();
      const before = calculatePhysicalStock(batches,product);
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
