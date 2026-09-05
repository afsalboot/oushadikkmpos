import {connectDb} from "@/lib/db";import {requireSession} from "@/lib/auth";import {apiError,ok} from "@/lib/api";import {createRole,getRoles} from "@/services/staff.service";
export async function GET(){try{await requireSession("staff.view");await connectDb();return ok(await getRoles());}catch(error){return apiError(error);}}
export async function POST(request){try{const actor=await requireSession("staff.manageRoles");await connectDb();return ok(await createRole(await request.json(),actor),201);}catch(error){return apiError(error);}}
