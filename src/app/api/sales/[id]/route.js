import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {Sale, StockTransaction, Customer} from "@/models";
import {getProducts} from "@/services/product.service";
import {creditSaleStock, saleEditProblem, saleStockReturns} from "@/lib/sale-edit";
import { saleForActor } from "@/lib/external-purchase";

export async function GET(request,{params}){
  try{
    const actor = await requireSession("sales.view");
    await connectDb();
    const{id}=await params;
    if(!mongoose.isValidObjectId(id))return fail("Invalid sale",400);
    const sale=await Sale.findById(id).populate("actorId","name role").lean();
    if(!sale)return fail("Sale not found",404);
    const editProblem = saleEditProblem(sale);
    if (new URL(request.url).searchParams.get("edit") === "true") {
      await requireSession("ADMIN");
      if (editProblem) return fail(editProblem, 422);
      const [products, rows, customer] = await Promise.all([
        getProducts({active: true, $or: [{visibleInSales: {$ne: false}}, {_id: {$in: sale.items.flatMap(item => item.kind === "MIX" ? item.ingredients.map(ingredient => ingredient.productId) : [item.productId])}}]}),
        StockTransaction.find({referenceType: "SALE", referenceId: sale._id}).lean(),
        sale.customerId ? Customer.findById(sale.customerId).lean() : null,
      ]);
      return ok({sale, products: creditSaleStock(products, saleStockReturns(sale, rows)), customer});
    }
    return ok({...saleForActor(sale, actor), canEdit: actor.role === "ADMIN" && !editProblem, editProblem});
  }catch(error){return apiError(error);}
}
