import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {getExpenseDetails,voidManualExpense} from "@/services/expense.service";

export async function POST(request,{params}){try{const auth=await requireSession("expenses.void");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid expense");await voidManualExpense(id,(await request.json()).reason,auth);return ok(await getExpenseDetails(id));}catch(error){return apiError(error);}}
