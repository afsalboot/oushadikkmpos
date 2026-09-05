import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {removeExpenseCategory,updateExpenseCategory} from "@/services/expense.service";

export async function PATCH(request,{params}){try{await requireSession("expenses.manageCategories");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid category");return ok(await updateExpenseCategory(id,await request.json()));}catch(error){return apiError(error);}}
export async function DELETE(_request,{params}){try{await requireSession("expenses.manageCategories");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid category");return ok(await removeExpenseCategory(id));}catch(error){return apiError(error);}}
