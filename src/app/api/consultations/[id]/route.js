import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {getConsultation,updateConsultation,deleteConsultation} from "@/services/consultation.service";
export async function GET(request,{params}){try{await requireSession("consultation.view");await connectDb();return ok(await getConsultation((await params).id));}catch(error){return apiError(error);}}
export async function PATCH(request,{params}){try{const actor=await requireSession("consultation.edit");await connectDb();return ok(await updateConsultation((await params).id,await request.json(),actor));}catch(error){return apiError(error);}}
export async function DELETE(request,{params}){try{const actor=await requireSession("consultation.delete");await connectDb();return ok(await deleteConsultation((await params).id,await request.json(),actor));}catch(error){return apiError(error);}}
