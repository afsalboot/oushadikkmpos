import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {listConsultations,createConsultation} from "@/services/consultation.service";
export async function GET(request){try{await requireSession("consultation.view");await connectDb();return ok(await listConsultations(new URL(request.url).searchParams));}catch(error){return apiError(error);}}
export async function POST(request){try{const actor=await requireSession("consultation.create");await connectDb();return ok(await createConsultation(await request.json(),actor),201);}catch(error){return apiError(error);}}
