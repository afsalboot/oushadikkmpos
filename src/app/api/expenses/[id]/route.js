import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {getExpenseDetails,updateManualExpense} from "@/services/expense.service";

export async function GET(_request,{params}){try{await requireSession("expenses.view");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid expense");return ok(await getExpenseDetails(id));}catch(error){return apiError(error);}}

export async function PATCH(request,{params}){try{const auth=await requireSession("expenses.edit");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid expense");await updateManualExpense(id,await request.json(),auth);return ok(await getExpenseDetails(id));}catch(error){return apiError(error);}}
