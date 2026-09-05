import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,ok} from "@/lib/api";
import {createManualExpense,getExpenses} from "@/services/expense.service";

export async function GET(request){try{await requireSession("expenses.view");await connectDb();return ok(await getExpenses(new URL(request.url).searchParams));}catch(error){return apiError(error);}}

export async function POST(request){try{const auth=await requireSession("expenses.create");await connectDb();return ok(await createManualExpense(await request.json(),auth),201);}catch(error){return apiError(error);}}
