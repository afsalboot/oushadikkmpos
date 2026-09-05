import mongoose from "mongoose";
import {connectDb} from "@/lib/db";
import {requireSession} from "@/lib/auth";
import {apiError,fail,ok} from "@/lib/api";
import {Expense,Purchase} from "@/models";
import {getPurchaseDetails,updateDraftPurchase} from "@/services/purchase.service";

export async function GET(_request,{params}){try{await requireSession("purchases.view");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");return ok(await getPurchaseDetails(id));}catch(error){return apiError(error);}}

export async function PUT(request,{params}){try{const auth=await requireSession("purchases.edit");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");await updateDraftPurchase(id,await request.json(),new mongoose.Types.ObjectId(auth.sub));return ok(await getPurchaseDetails(id));}catch(error){return apiError(error);}}

export async function PATCH(request,{params}){try{await requireSession("purchases.edit");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");const purchase=await Purchase.findById(id);if(!purchase)return fail("Purchase not found",404);const body=await request.json();purchase.supplierInvoiceNumber=String(body.supplierInvoiceNumber??purchase.supplierInvoiceNumber).trim();purchase.notes=String(body.notes??purchase.notes).trim();await purchase.save();return ok(await getPurchaseDetails(id));}catch(error){return apiError(error);}}

export async function DELETE(_request,{params}){try{await requireSession("ADMIN");await connectDb();const{id}=await params;if(!mongoose.isValidObjectId(id))return fail("Invalid purchase");const purchase=await Purchase.findById(id);if(!purchase)return fail("Purchase not found",404);if(purchase.purchaseStatus!=="DRAFT")return fail("Received purchases cannot be deleted. Cancel the purchase to reverse inventory safely.",409);await Promise.all([Expense.deleteMany({source:"PURCHASE",referenceId:purchase._id}),Purchase.deleteOne({_id:purchase._id})]);return ok({deleted:true});}catch(error){return apiError(error);}}
