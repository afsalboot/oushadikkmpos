import {requireSession} from "@/lib/auth";
import {apiError,ok} from "@/lib/api";
import {createBackup,getBackupStatus} from "@/services/backup.service";

export const runtime="nodejs";

export async function GET(){try{await requireSession("ADMIN");return ok(await getBackupStatus());}catch(error){return apiError(error);}}

export async function POST(){try{const actor=await requireSession("ADMIN"),backup=await createBackup({type:"manual",actor});return ok(backup,201);}catch(error){return apiError(error);}}
