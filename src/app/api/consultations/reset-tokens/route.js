import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, apiError } from "@/lib/api";
import { resetConsultationTokens } from "@/services/consultation.service";

export async function POST(request) {
  try {
    const actor = await requireSession("ADMIN");
    await connectDb();
    return ok(await resetConsultationTokens(await request.json(), actor));
  } catch (error) { return apiError(error); }
}
