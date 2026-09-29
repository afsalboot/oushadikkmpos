import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {cancelConsultation} from "@/services/consultation.service";
export async function POST(request,{params}){try{const actor=await requireSession("consultation.cancel");await connectDb();return ok(await cancelConsultation((await params).id,await request.json(),actor));}catch(error){return apiError(error);}}
