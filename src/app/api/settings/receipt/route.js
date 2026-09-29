import { requireSession } from "@/lib/auth";
import { getSettings } from "@/services/settings.service";
import { ok, apiError } from "@/lib/api";
export async function GET() { try { await requireSession(); const settings = await getSettings(); return ok({ receipt: settings.receipt }); } catch (error) { return apiError(error); } }
