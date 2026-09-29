import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {saveDoctor} from "@/services/doctor.service";
export async function PATCH(request,{params}){try{const actor=await requireSession("doctor.manage");await connectDb();return ok(await saveDoctor((await params).id,await request.json(),actor));}catch(error){return apiError(error);}}
