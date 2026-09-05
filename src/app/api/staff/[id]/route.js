import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import {getStaffDetails,setStaffStatus,updateStaff} from "@/services/staff.service";

export async function GET(_request,{params}){try{await requireSession("staff.view");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid staff account");return ok(await getStaffDetails(id));}catch(error){return apiError(error);}}
export async function PATCH(request,{params}){try{const actor=await requireSession("staff.edit");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid staff account");const body=await request.json();if(body.customizePermissions)await requireSession("staff.managePermissions");return ok(await updateStaff(id,body,actor));}catch(error){return apiError(error);}}
export async function PUT(request,context){return PATCH(request,context);}
export async function DELETE(_request,{params}){try{const actor=await requireSession("staff.deactivate");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid staff account");return ok(await setStaffStatus(id,false,"",actor));}catch(error){return apiError(error);}}
