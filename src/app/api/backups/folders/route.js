import { usesDatabaseBackupStorage } from "@/lib/backup-storage";
import { requireSession } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { browseBackupFolders } from "@/lib/backup-folders";

export const runtime = "nodejs";
export async function GET(request) {
  try {
    await requireSession("ADMIN");
    if (usesDatabaseBackupStorage()) throw Object.assign(new Error("Hosted backups use database storage; server folders are unavailable."), { status: 400 });
    return ok(await browseBackupFolders(new URL(request.url).searchParams.get("path") || ""));
  } catch (error) { return apiError(error); }
}
