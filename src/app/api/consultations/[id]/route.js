import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {getConsultation} from "@/services/consultation.service";
export async function GET(request,{params}){try{await requireSession("consultation.view");await connectDb();return ok(await getConsultation((await params).id));}catch(error){return apiError(error);}}
