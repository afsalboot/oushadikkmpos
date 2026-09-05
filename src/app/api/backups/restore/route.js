import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {restoreBackup} from "@/services/backup.service";

export const runtime="nodejs";
const MAX_BACKUP_BYTES=100*1024*1024;

export async function POST(request){try{const actor=await requireSession("ADMIN"),contentLength=Number(request.headers.get("content-length")||0);if(contentLength>MAX_BACKUP_BYTES)return fail("Backup archive exceeds the 100 MB restore limit",413);const form=await request.formData();if(form.get("confirmation")!=="RESTORE DATABASE")return fail("Type RESTORE DATABASE to confirm",400);const file=form.get("archive");if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".obak"))return fail("Select an Oushadi .obak backup file",400);if(file.size>MAX_BACKUP_BYTES)return fail("Backup archive exceeds the 100 MB restore limit",413);return ok(await restoreBackup(Buffer.from(await file.arrayBuffer()),actor));}catch(error){return apiError(error);}}
