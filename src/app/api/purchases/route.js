import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,ok} from "@/lib/api";
import {createPurchase,getPurchases} from "@/services/purchase.service";

export async function GET(request){try{await requireSession("purchases.view");await connectDb();return ok(await getPurchases(new URL(request.url).searchParams));}catch(error){return apiError(error);}}

export async function POST(request){try{const auth=await requireSession("purchases.create");await connectDb();const purchase=await createPurchase(await request.json(),new mongoose.Types.ObjectId(auth.sub));return ok(purchase,201);}catch(error){return apiError(error);}}
