import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { getProductDetails, getProducts } from "@/services/product.service";
import { salesCacheResponse } from '@/lib/sales-cache-scope';

export async function GET(_request, { params }) {
  try {
    const salesOnly = new URL(_request.url).searchParams.get('sales') === 'true';
    const session = await requireSession(salesOnly ? ['sales.view', 'products.view'] : 'products.view');
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product");
    if (salesOnly) {
      const [product] = await getProducts({ _id: id, active: true, visibleInSales: { $ne: false } }, { salesOnly: true });
      return salesCacheResponse(product ? ok(product) : fail('Product is no longer available in Sales', 404), session);
    }
    return ok(await getProductDetails(id));
  } catch (error) {
    return apiError(error);
  }
}
