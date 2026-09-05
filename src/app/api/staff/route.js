import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, apiError } from "@/lib/api";
import {createStaff,getStaff} from "@/services/staff.service";

export async function GET(request){try{const actor=await requireSession("staff.view");await connectDb();const data=await getStaff(new URL(request.url).searchParams),allowed=(permission)=>actor.role==="ADMIN"||actor.permissions.includes(permission);data.capabilities={create:allowed("staff.create"),edit:allowed("staff.edit"),deactivate:allowed("staff.deactivate"),managePermissions:allowed("staff.managePermissions"),manageRoles:allowed("staff.manageRoles"),resetPassword:allowed("staff.resetPassword")};return ok(data);}catch(error){return apiError(error);}}
export async function POST(request){try{const actor=await requireSession("staff.create");await connectDb();const body=await request.json();if(body.customizePermissions)await requireSession("staff.managePermissions");return ok(await createStaff(body,actor),201);}catch(error){return apiError(error);}}
