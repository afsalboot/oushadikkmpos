import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Product, InventoryBatch, AuditLog, Category } from "@/models";
import { createProduct, getProducts, updateProduct } from "@/services/product.service";
import { requestTiming } from "@/lib/performance";
import { productStockFilterPipeline } from "@/lib/product-stock-query";
import { getProductCatalogue } from "@/services/product-catalogue.service";
import { salesCacheResponse } from '@/lib/sales-cache-scope';

export async function GET(request) {
  const timing = requestTiming('products');
  try {
    const session = await timing.measure('auth', () => requireSession("products.view"));
    await timing.measure('connection', () => connectDb());
    const parameters = new URL(request.url).searchParams;
    if (parameters.get('view') === 'sales-stock-ids') {
      const stock = parameters.get('stock');
      if (!['low', 'opened'].includes(stock)) return timing.finish(fail('Invalid stock filter', 422));
      const rows = await timing.measure('stock_filter', () => Product.aggregate(productStockFilterPipeline({ active: true, visibleInSales: { $ne: false } }, stock)));
      return timing.finish(salesCacheResponse(ok({ ids: rows.map(row => String(row._id)) }), session));
    }
    if(parameters.get('view')==='catalogue') {
      if(parameters.has('category')&&parameters.get('category')!=='ALL'&&!mongoose.isValidObjectId(parameters.get('category')))return timing.finish(fail('Invalid category',422));
      const catalogue=await getProductCatalogue(parameters,timing);
      return timing.finish(await timing.measure('serialization',()=>ok(catalogue)));
    }
    if(parameters.get('view')==='options') {
      return timing.finish(ok(await Product.find().select('name sku active packageType packageSize baseUnit batchNumber batchTracking expiryTracking taxable gstExempt gstRate useDefaultGstRate gstPriceMode packageSellingPrice').sort({name:1}).lean()));
    }
    const search = (parameters.get("q") || parameters.get("search") || '').trim();
    if (search.length > 100) return timing.finish(fail('Search is too long', 422));
    const query = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const salesOnly = parameters.get("sales") === "true";
    const filter = query
      ? { $or: [{ name: { $regex: query, $options: "i" } }, { sku: { $regex: query, $options: "i" } }, { barcode: { $regex: query, $options: "i" } }, { manufacturer: { $regex: query, $options: "i" } }] }
      : {};
    if (salesOnly) Object.assign(filter, { active: true, visibleInSales: { $ne: false } });
    if (query && salesOnly) {
      const matchingCategories = await Category.find({ name: { $regex: query, $options: 'i' } }).select('_id').lean();
      if (matchingCategories.length) filter.$or.push({ categoryId: { $in: matchingCategories.map(row => row._id) } });
    }
    if (parameters.get('mode') === 'mix') filter.allowMixture = true;
    if (parameters.get('loose') === 'true') filter.allowLooseSale = true;
    if (parameters.has('barcode')) filter.barcode = parameters.get('barcode');
    if(parameters.has('ids')) {
      const ids=parameters.get('ids').split(',').filter(Boolean);
      if(!ids.length||ids.length>200||ids.some(id=>!mongoose.isValidObjectId(id)))return timing.finish(fail('Invalid product selection',422));
      filter._id={$in:ids.map(id=>new mongoose.Types.ObjectId(id))};
    }
    if (parameters.has('category')) {
      if (!mongoose.isValidObjectId(parameters.get('category'))) return timing.finish(fail('Invalid category', 422));
      filter.categoryId = new mongoose.Types.ObjectId(parameters.get('category'));
    }
    if (['low', 'opened'].includes(parameters.get('stock'))) {
      const ids = await timing.measure('stock_filter', () => Product.aggregate(productStockFilterPipeline(filter, parameters.get('stock'))));
      filter._id = { $in: ids.map(row => row._id) };
    }
    const paginated = parameters.has('page') || parameters.has('limit');
    const page = paginated ? Math.max(1, Math.floor(Number(parameters.get('page')) || 1)) : undefined;
    const limit = Math.min(100, Math.max(1, Math.floor(Number(parameters.get('limit')) || 50)));
    const [rows, total] = await Promise.all([
      getProducts(filter, { salesOnly, page, limit, timing }),
      paginated ? timing.measure('count', () => Product.countDocuments(filter)) : null,
    ]);
    const response = await timing.measure('serialization', () => ok(paginated ? { rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } } : rows));
    return timing.finish(salesOnly ? salesCacheResponse(response, session) : response);
  } catch (error) {
    return timing.finish(apiError(error));
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
