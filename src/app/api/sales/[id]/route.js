import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {Sale} from "@/models";

export async function GET(_request,{params}){
  try{
    await requireSession("sales.view");
    await connectDb();
    const{id}=await params;
    if(!mongoose.isValidObjectId(id))return fail("Invalid sale",400);
    const sale=await Sale.findById(id).populate("actorId","name role").lean();
    if(!sale)return fail("Sale not found",404);
    return ok(sale);
  }catch(error){return apiError(error);}
}
