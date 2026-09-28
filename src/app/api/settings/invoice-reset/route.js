import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { apiError, ok } from "@/lib/api";
import { previewFutureInvoiceReset, resetFutureInvoiceNumbers } from "@/services/future-invoice-reset.service";

export async function GET() {
  try {
    await requireSession("ADMIN");
    await connectDb();
    return ok(await previewFutureInvoiceReset());
  } catch (error) { return apiError(error); }
}

export async function POST(request) {
  try {
    const actor = await requireSession("ADMIN");
    await connectDb();
    return ok(await resetFutureInvoiceNumbers(await request.json(), actor));
  } catch (error) { return apiError(error); }
}
