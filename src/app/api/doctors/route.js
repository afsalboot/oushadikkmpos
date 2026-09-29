import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {ok,apiError} from "@/lib/api";
import {Doctor} from "@/models";
import {saveDoctor} from "@/services/doctor.service";
export async function GET(){try{const actor=await requireSession("doctor.view");await connectDb();return ok({rows:await Doctor.find().sort({name:1}).lean(),canManage:actor.role==="ADMIN"||actor.permissions.includes("doctor.manage")});}catch(error){return apiError(error);}}
export async function POST(request){try{const actor=await requireSession("doctor.manage");await connectDb();return ok(await saveDoctor(null,await request.json(),actor),201);}catch(error){return apiError(error);}}
