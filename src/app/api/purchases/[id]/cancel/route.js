import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {cancelPurchase,getPurchaseDetails} from "@/services/purchase.service";

export async function POST(request,{params}){try{const auth=await requireSession("purchases.cancel");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");const body=await request.json();await cancelPurchase(id,body.reason,new mongoose.Types.ObjectId(auth.sub));return ok(await getPurchaseDetails(id));}catch(error){return apiError(error);}}
