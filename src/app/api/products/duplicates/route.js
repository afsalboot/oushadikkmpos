import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { getProducts } from "@/services/product.service";
import { findProductDuplicateGroups } from "@/lib/product-duplicates";
import { PRODUCT_DUPLICATE_OPTIONS } from "@/lib/product-import-duplicates";

export async function GET(request) {
  try {
    const actor = await requireSession("products.view");
    await connectDb();
    const matchBy = new URL(request.url).searchParams.get("matchBy") || "DETAILS";
    if (!PRODUCT_DUPLICATE_OPTIONS.some(([value]) => value === matchBy)) return fail("Invalid duplicate matching field");
    return ok({ groups: findProductDuplicateGroups(await getProducts(), matchBy), canMerge: actor.role === "ADMIN" });
  } catch (error) { return apiError(error); }
}
