import {requireSession} from "@/lib/auth";
import {apiError} from "@/lib/api";
import {readBackup} from "@/services/backup.service";

export const runtime="nodejs";

export async function GET(_request,{params}){try{await requireSession("ADMIN");const {name}=await params,archive=await readBackup(name);return new Response(archive,{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"no-store"}});}catch(error){return apiError(error);}}
