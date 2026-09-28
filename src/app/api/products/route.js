import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Product, InventoryBatch, AuditLog } from "@/models";
import { createProduct, getProducts, updateProduct } from "@/services/product.service";

export async function GET(request) {
  try {
    await requireSession("products.view");
    await connectDb();
    const parameters = new URL(request.url).searchParams;
    const query = parameters.get("q")?.trim();
    const salesOnly = parameters.get("sales") === "true";
    const filter = query
      ? { $or: [{ name: { $regex: query, $options: "i" } }, { sku: { $regex: query, $options: "i" } }, { barcode: { $regex: query, $options: "i" } }, { manufacturer: { $regex: query, $options: "i" } }] }
      : {};
    if (salesOnly) Object.assign(filter, { active: true, visibleInSales: { $ne: false } });
    return ok(await getProducts(filter));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request) {
  let dbSession;
  try {
    const auth = await requireSession("products.create");
    await connectDb();
    const body = await request.json();
    dbSession = await mongoose.startSession();
    let created;
    await dbSession.withTransaction(async () => { created = await createProduct(body, new mongoose.Types.ObjectId(auth.sub), dbSession); });
    return ok(created, 201);
  } catch (error) {
    return apiError(error);
  } finally {
    if (dbSession) await dbSession.endSession();
  }
}

export async function PUT(request) {
  try {
    const actor=await requireSession("products.edit");
    await connectDb();
    const body = await request.json();
    if (!mongoose.isValidObjectId(body.id)) return fail("Invalid product");
    return ok(await updateProduct(body.id, body, actor));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request) {
  try {
    await requireSession("products.deactivate");
    await connectDb();
    const { id, visibleInSales, active } = await request.json();
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product update");
    const changes = {};
    if (typeof visibleInSales === "boolean") changes.visibleInSales = visibleInSales;
    if (typeof active === "boolean") changes.active = active;
    if (!Object.keys(changes).length) return fail("No valid product changes supplied");
    const product = await Product.findByIdAndUpdate(id, { $set: changes }, { returnDocument: "after" });
    if (!product) return fail("Product not found", 404);
    return ok(product);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request) {
  try {
    const actor = await requireSession("ADMIN");
    await connectDb();
    const id = new URL(request.url).searchParams.get("id");
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product");
    const productId = new mongoose.Types.ObjectId(id);
    const product = await Product.findById(id);
    if (!product) return fail("Product not found", 404);
    await mongoose.connection.transaction(async (session) => {
      const batches = await InventoryBatch.find({ productId }).session(session).lean();
      await AuditLog.create([{ actorId: actor.sub, action: "PRODUCT_DELETED", module: "products", targetType: "Product", targetId: productId, description: `Deleted ${product.name}`, metadata: { product: product.toObject(), batches } }], { session });
      await InventoryBatch.deleteMany({ productId }, { session });
      await Product.deleteOne({ _id: productId }, { session });
    });
    return ok({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
