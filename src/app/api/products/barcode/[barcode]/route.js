import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { normalizeBarcode, validateBarcode } from "@/lib/barcode";
import { getProducts } from "@/services/product.service";
import { salesCacheResponse } from '@/lib/sales-cache-scope';

export async function GET(request, { params }) {
  try {
    const session = await requireSession("products.view");
    await connectDb();
    const { barcode: rawBarcode } = await params;
    const barcode = normalizeBarcode(rawBarcode);
    const context = new URL(request.url).searchParams.get("context") || "sale";
    const errors = validateBarcode(barcode);
    if (!barcode || errors.length) return fail(errors[0] || "Enter a valid barcode", 400);
    const [product] = await getProducts({ barcode }, { salesOnly: context === 'sale' });
    if (!product) return fail("Barcode not registered", 404);
    if (product.active === false) return fail(`${product.name} is inactive`, 409);
    if (context === "sale") {
      if (product.visibleInSales === false) return fail(`${product.name} is not available on the Sales screen`, 409);
      if (!product.stock?.hasStock) return fail(`${product.name} is out of stock`, 409);
    }
    return context === 'sale' ? salesCacheResponse(ok(product), session) : ok(product);
  } catch (error) {
    return apiError(error);
  }
}
