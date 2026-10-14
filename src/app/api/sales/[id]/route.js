import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {Sale, SalesHistoryLedger} from "@/models";
import {retentionStoreId} from "@/services/sale-history.service";
import {RETAINED_BILL_MESSAGE} from "@/lib/sale-retention";
import {saleEditProblem} from "@/lib/sale-edit";
import {getSaleEditData, getSaleEditProductPage} from "@/services/sale-edit-read.service";
import {requestTiming} from "@/lib/performance";
import { saleForActor } from "@/lib/external-purchase";

export async function GET(request,{params}){
  const timing = requestTiming('sale-detail');
  try{
    const actor = await timing.measure('auth', () => requireSession("sales.view"));
    const parameters = new URL(request.url).searchParams;
    const editing = parameters.get('edit') === 'true';
    if (editing) await requireSession("ADMIN");
    await timing.measure('connection', () => connectDb());
    const{id}=await params;
    if(!mongoose.isValidObjectId(id))return timing.finish(fail("Invalid sale",400));
    const sale=await timing.measure('sale', () => Sale.findById(id).populate("actorId","name role").lean());
    if(!sale){const old=await SalesHistoryLedger.exists({_id:id,storeId:await retentionStoreId(),purgedAt:{$ne:null}});return timing.finish(fail(old?RETAINED_BILL_MESSAGE:"Sale not found",old?410:404));}
    const editProblem = saleEditProblem(sale);
    if (editing) {
      if (editProblem) return timing.finish(fail(editProblem, 422));
      const data = parameters.get('view') === 'products'
        ? await getSaleEditProductPage(sale, parameters, timing) : await getSaleEditData(sale, timing);
      return timing.finish(await timing.measure('serialization', () => ok(data)));
    }
    return timing.finish(ok({...saleForActor(sale, actor), canEdit: actor.role === "ADMIN" && !editProblem, editProblem}));
  }catch(error){return timing.finish(apiError(error));}
}
