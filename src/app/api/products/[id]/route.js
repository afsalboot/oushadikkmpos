import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { getProductDetails } from "@/services/product.service";

export async function GET(_request, { params }) {
  try {
    await requireSession("products.view");
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid product");
    return ok(await getProductDetails(id));
  } catch (error) {
    return apiError(error);
  }
}
