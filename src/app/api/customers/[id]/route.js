import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Customer, Sale, AuditLog } from "@/models";
import {customerFields,findDuplicateCustomer} from "@/services/customer.service";

export async function GET(_request, { params }) {
  try {
    await requireSession("customers.view"); await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid customer");
    const customer = await Customer.findById(id).lean();
    if (!customer) return fail("Customer not found", 404);
    const bills = await Sale.find({ customerId: customer._id }).sort({ createdAt: -1 }).lean();
    const totals=bills.map((bill)=>Number(bill.total||0)),productCounts=new Map();
    for(const bill of bills)for(const item of bill.items||[]){if(item.kind==="MIX")for(const ingredient of item.ingredients||[])productCounts.set(ingredient.name,(productCounts.get(ingredient.name)||0)+1);else productCounts.set(item.name,(productCounts.get(item.name)||0)+1)}
    const stats={purchaseCount:bills.length,totalSpent:totals.reduce((sum,value)=>sum+value,0),averageBill:bills.length?totals.reduce((sum,value)=>sum+value,0)/bills.length:0,highestBill:totals.length?Math.max(...totals):0,firstPurchaseAt:bills.at(-1)?.createdAt||null,lastPurchaseAt:bills[0]?.createdAt||null};
    const frequentProducts=[...productCounts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,purchases])=>({name,purchases}));
    return ok({ customer, stats, bills, frequentProducts });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request, { params }) {
  try {
    const actor=await requireSession("customers.edit"); await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid customer");
    const body = await request.json();
    const before=await Customer.findById(id).lean();
    if(!before)return fail("Customer not found",404);
    const fields = customerFields({...before,...body});
    if (!fields.name) return fail("Customer name is required");
    const duplicate=await findDuplicateCustomer(fields,null,id);if(duplicate)return fail(`Customer already exists: ${duplicate.name}`,409);
    let customer;
    await mongoose.connection.transaction(async session=>{
      customer=await Customer.findByIdAndUpdate(id,{$set:fields},{returnDocument:"after",runValidators:true,session});
      await AuditLog.create([{actorId:actor.sub,action:"CUSTOMER_UPDATED",module:"customers",targetType:"Customer",targetId:id,description:"Updated customer details",metadata:{before,after:fields}}],{session});
    });
    if (!customer) return fail("Customer not found", 404);
    return ok(customer);
  } catch (error) { return apiError(error); }
}
export const PUT=PATCH;

export async function DELETE(_request, { params }) {
  try {
    await requireSession("customers.deactivate"); await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return fail("Invalid customer");
    const customerId = new mongoose.Types.ObjectId(id);
    const billCount = await Sale.countDocuments({ customerId });
    const customer = billCount ? await Customer.findByIdAndUpdate(id, { $set: { active: false,status:"INACTIVE" } }) : await Customer.findByIdAndDelete(id);
    if (!customer) return fail("Customer not found", 404);
    return ok({ deleted: !billCount, archived: billCount > 0 });
  } catch (error) { return apiError(error); }
}
