import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {StockTransaction} from "@/models";

export async function GET(_request,{params}){try{await requireSession("purchases.view");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");return ok(await StockTransaction.find({referenceType:"PURCHASE",referenceId:id}).populate("productId","name sku packageType packageSize baseUnit").populate("batchId","batchNumber expiryDate").sort({createdAt:1}).lean());}catch(error){return apiError(error);}}
