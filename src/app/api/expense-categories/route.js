import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,ok} from "@/lib/api";
import {createExpenseCategory,getExpenseCategories} from "@/services/expense.service";

export async function GET(request){try{await requireSession("expenses.view");await connectDb();return ok(await getExpenseCategories(new URL(request.url).searchParams.get("includeInactive")==="true"));}catch(error){return apiError(error);}}
export async function POST(request){try{await requireSession("expenses.manageCategories");await connectDb();return ok(await createExpenseCategory(await request.json()),201);}catch(error){return apiError(error);}}
