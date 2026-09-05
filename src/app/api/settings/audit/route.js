import {connectDb} from "@/lib/db";import {requireSession} from "@/lib/auth";import {apiError,ok} from "@/lib/api";import {getSettingsAudit} from "@/services/settings.service";
export async function GET(request){try{await requireSession("settings.edit");await connectDb();return ok(await getSettingsAudit(new URL(request.url).searchParams));}catch(error){return apiError(error);}}
