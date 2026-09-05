import mongoose from "mongoose";
import {DocumentCounter,Expense,ExpenseCategory,InventoryBatch,Product,Purchase,StockTransaction,Supplier} from "@/models";
import {maxDocumentSequence,nextDocumentNumber} from "@/services/document-number.service";
import {calculatePurchaseTotals,purchaseMoney as money,receivedPackageQuantity} from "@/lib/purchase-calculations";
import {queryValues} from "@/lib/filter-utils";

export const PURCHASE_PAYMENT_METHODS=["CASH","UPI","CARD","BANK"];
const text=(value)=>String(value??"").trim();
const dateValue=(value,label,required=false)=>{if(!value&&!required)return undefined;const result=new Date(value);if(Number.isNaN(result.getTime()))throw new Error(`Enter a valid ${label}`);return result;};

function paymentFields(body,total,purchaseStatus){
  if(purchaseStatus==="DRAFT")return{paymentStatus:"UNPAID",paymentMethod:"CASH",amountPaid:0,balanceDue:total,paymentReference:""};
  const paymentStatus=["PAID","PARTIAL","UNPAID"].includes(body.paymentStatus)?body.paymentStatus:"PAID";
  const paymentMethod=text(body.paymentMethod||"CASH").toUpperCase();
  if(!PURCHASE_PAYMENT_METHODS.includes(paymentMethod))throw new Error("Select a valid payment method");
  let amountPaid=paymentStatus==="PAID"?total:paymentStatus==="UNPAID"?0:money(body.amountPaid);
  if(paymentStatus==="PARTIAL"&&(!(amountPaid>0)||amountPaid>=total))throw new Error("Partial payment must be greater than zero and less than the purchase total");
  amountPaid=money(amountPaid);
  return{paymentStatus,paymentMethod,amountPaid,balanceDue:money(total-amountPaid),paymentReference:paymentMethod==="CASH"?"":text(body.paymentReference)};
}

export async function preparePurchase(body,session){
  if(!mongoose.isValidObjectId(body.supplierId))throw new Error("Select a supplier");
  if(!Array.isArray(body.items)||!body.items.length)throw new Error("Add at least one purchase item");
  const supplier=await Supplier.findOne({_id:body.supplierId,active:{$ne:false}}).session(session);if(!supplier)throw new Error("Supplier not found");
  const ids=body.items.map((item)=>text(item.productId));if(ids.some((id)=>!mongoose.isValidObjectId(id)))throw new Error("A purchase item has an invalid product");
  const products=await Product.find({_id:{$in:ids},active:true}).session(session);const byId=new Map(products.map((product)=>[String(product._id),product]));
  const seen=new Set();
  const storeStateCode=text(body.storeStateCode||"32");const supplierStateCode=text(body.supplierStateCode||supplier.taxNumber?.slice(0,2));const taxType=body.gstEnabled&&supplierStateCode?(supplierStateCode===storeStateCode?"CGST_SGST":"IGST"):"NONE";
  const items=body.items.map((input)=>{
    const product=byId.get(text(input.productId));if(!product)throw new Error("A selected product is unavailable");
    const packageQuantity=Number(input.packageQuantity),freeQuantity=Number(input.freeQuantity||0),unitCost=money(input.unitCost);
    if(!Number.isInteger(packageQuantity)||packageQuantity<=0)throw new Error(`Enter a valid purchased package quantity for ${product.name}`);
    if(!Number.isInteger(freeQuantity)||freeQuantity<0)throw new Error(`Enter a valid free package quantity for ${product.name}`);
    if(!Number.isFinite(unitCost)||unitCost<0)throw new Error(`Enter a valid purchase cost for ${product.name}`);
    const batchNumber=text(input.batchNumber)||(product.batchTracking?"":"DEFAULT");if(!batchNumber)throw new Error(`Batch number is required for ${product.name}`);
    const key=`${product._id}:${batchNumber.toUpperCase()}`;if(seen.has(key))throw new Error(`${product.name} batch ${batchNumber} is listed more than once`);seen.add(key);
    const manufacturingDate=dateValue(input.manufacturingDate,`manufacturing date for ${product.name}`);
    const expiryDate=dateValue(input.expiryDate,`expiry date for ${product.name}`,product.expiryTracking);
    if(manufacturingDate&&expiryDate&&expiryDate<=manufacturingDate)throw new Error(`Expiry date must be after manufacturing date for ${product.name}`);
    if(expiryDate&&expiryDate<new Date(new Date().setHours(0,0,0,0)))throw new Error(`${product.name} batch ${batchNumber} is already expired`);
    const gstRate=body.gstEnabled?Math.max(0,Number(input.gstRate??product.gstRate??0)):0;const gstPriceMode=input.gstPriceMode==="EXCLUSIVE"?"EXCLUSIVE":"INCLUSIVE";const gross=money(packageQuantity*unitCost);const taxableAmount=money(gstPriceMode==="INCLUSIVE"&&gstRate?gross/(1+gstRate/100):gross);const totalGst=money(gstPriceMode==="INCLUSIVE"?gross-taxableAmount:taxableAmount*gstRate/100);const itemTaxType=gstRate?taxType:"NONE";const cgst=itemTaxType==="CGST_SGST"?money(totalGst/2):0,sgst=cgst,igst=itemTaxType==="IGST"?totalGst:0;
    return{productId:product._id,productSnapshot:{name:product.name,sku:product.sku,packageType:product.packageType,packageSize:product.packageSize,baseUnit:product.baseUnit},name:product.name,hsnCode:text(product.hsnCode),batchNumber,manufacturingDate,expiryDate,packageQuantity,freeQuantity,unitCost,total:gross,gstRate,gstPriceMode,taxType:itemTaxType,taxableAmount,cgst,sgst,igst,totalGst,lineTotal:money(gross+(gstPriceMode==="EXCLUSIVE"?totalGst:0))};
  });
  const totals=calculatePurchaseTotals(items,body);const purchaseStatus=body.purchaseStatus==="DRAFT"?"DRAFT":"RECEIVED";
  return{supplier,items,byId,supplierStateCode,storeStateCode,taxType,purchasedAt:dateValue(body.purchasedAt,"purchase date")||new Date(),purchaseStatus,...totals,...paymentFields(body,totals.total,purchaseStatus)};
}

const purchaseFields=(body,prepared,actorId)=>({
  supplierId:prepared.supplier._id,supplierSnapshot:{name:prepared.supplier.name,phone:prepared.supplier.phone,email:prepared.supplier.email,taxNumber:prepared.supplier.taxNumber},supplierInvoiceNumber:text(body.supplierInvoiceNumber),notes:text(body.notes),items:prepared.items,
  subtotal:prepared.subtotal,taxableAmount:prepared.taxableAmount,totalGst:prepared.totalGst,cgst:prepared.cgst,sgst:prepared.sgst,igst:prepared.igst,taxType:prepared.taxType,supplierStateCode:prepared.supplierStateCode,storeStateCode:prepared.storeStateCode,additionalCharges:prepared.additionalCharges,discountType:prepared.discountType,discountValue:prepared.discountValue,discount:prepared.discount,total:prepared.total,
  paymentStatus:prepared.paymentStatus,paymentMethod:prepared.paymentMethod,amountPaid:prepared.amountPaid,balanceDue:prepared.balanceDue,paymentReference:prepared.paymentReference,purchaseStatus:prepared.purchaseStatus,purchasedAt:prepared.purchasedAt,actorId,
});

async function productStock(product,session){const countBased=product?.loosePricingMethod==="count_based";const quantity=countBased?{$multiply:["$sealedPackages","$packageSize"]}:{$add:[{$multiply:["$sealedPackages","$packageSize"]},"$openQuantity"]};const rows=await InventoryBatch.aggregate([{$match:{productId:product._id}},{$group:{_id:null,total:{$sum:quantity}}}]).session(session);return Number(rows[0]?.total||0);}

export async function receivePurchaseStock(purchase,prepared,actorId,session){
  for(const item of prepared.items){
    const product=prepared.byId.get(String(item.productId));const packageQuantity=receivedPackageQuantity(item);const addedBase=packageQuantity*Number(product.packageSize);const previousStock=await productStock(product,session);
    const batch=await InventoryBatch.findOneAndUpdate({productId:product._id,batchNumber:item.batchNumber},{$set:{packageSize:product.packageSize,manufacturingDate:item.manufacturingDate,expiryDate:item.expiryDate,purchasePrice:item.unitCost,sellingPrice:product.packageSellingPrice,supplierId:prepared.supplier._id,status:"ACTIVE"},$inc:{sealedPackages:packageQuantity},$setOnInsert:{openQuantity:0}},{returnDocument:"after",upsert:true,setDefaultsOnInsert:true,session});
    await StockTransaction.create([{productId:product._id,batchId:batch._id,type:"PURCHASE",baseQuantity:addedBase,packageQuantity,unit:product.baseUnit,direction:"IN",previousStock,newStock:previousStock+addedBase,referenceType:"PURCHASE",referenceId:purchase._id,reason:"Supplier purchase received",note:purchase.purchaseNumber,actorId}],{session,ordered:true});
  }
}

async function syncPurchaseExpense(purchase,session){
  const category=await ExpenseCategory.findOneAndUpdate({name:"Purchase"},{$setOnInsert:{name:"Purchase",description:"System category for supplier purchase expenses",type:"SYSTEM",active:true}},{upsert:true,returnDocument:"after",setDefaultsOnInsert:true,session});
  const values={title:"Inventory Purchase",categoryId:category._id,category:"Purchase",description:`${purchase.purchaseNumber} · ${purchase.supplierSnapshot.name}`,amount:purchase.total,paidAmount:purchase.amountPaid,balanceDue:purchase.balanceDue,paymentMethod:purchase.paymentMethod,paymentReference:purchase.paymentReference,expenseDate:purchase.purchasedAt,source:"PURCHASE",referenceType:"PURCHASE",referenceId:purchase._id,supplierId:purchase.supplierId,actorId:purchase.actorId,status:"ACTIVE"};
  const existing=await Expense.findOne({source:"PURCHASE",referenceId:purchase._id}).session(session);if(existing){existing.set(values);await existing.save({session});return existing;}
  const prior=await Expense.find({expenseNumber:/-(\d+)$/}).select("expenseNumber").session(session).lean();const expenseNumber=await nextDocumentNumber({Counter:DocumentCounter,prefix:"EXP",value:purchase.purchasedAt,session,minimumSequence:maxDocumentSequence(prior.map((entry)=>entry.expenseNumber))});const[created]=await Expense.create([{...values,expenseNumber}],{session,ordered:true});return created;
}

export async function createPurchase(body,actorId){
  const session=await mongoose.startSession();let purchase;
  try{await session.withTransaction(async()=>{const prepared=await preparePurchase(body,session);const prior=await Purchase.find({purchaseNumber:/-(\d+)$/}).select("purchaseNumber").session(session).lean();const purchaseNumber=await nextDocumentNumber({Counter:DocumentCounter,prefix:"PUR",value:prepared.purchasedAt,session,minimumSequence:maxDocumentSequence(prior.map((entry)=>entry.purchaseNumber))});[purchase]=await Purchase.create([{purchaseNumber,...purchaseFields(body,prepared,actorId)}],{session,ordered:true});if(prepared.purchaseStatus==="RECEIVED"){await receivePurchaseStock(purchase,prepared,actorId,session);await syncPurchaseExpense(purchase,session);}});return purchase;}finally{await session.endSession();}
}

export async function updateDraftPurchase(id,body,actorId){
  const session=await mongoose.startSession();let purchase;
  try{await session.withTransaction(async()=>{purchase=await Purchase.findById(id).session(session);if(!purchase)throw new Error("Purchase not found");if(purchase.purchaseStatus!=="DRAFT")throw new Error("Only draft purchases can change stock-affecting fields");const prepared=await preparePurchase(body,session);purchase.set(purchaseFields(body,prepared,actorId));await purchase.save({session});if(prepared.purchaseStatus==="RECEIVED"){await receivePurchaseStock(purchase,prepared,actorId,session);await syncPurchaseExpense(purchase,session);}});return purchase;}finally{await session.endSession();}
}

export async function cancelPurchase(id,reason,actorId){
  const session=await mongoose.startSession();let purchase;
  try{await session.withTransaction(async()=>{purchase=await Purchase.findById(id).session(session);if(!purchase)throw new Error("Purchase not found");if(purchase.purchaseStatus!=="RECEIVED")throw new Error("Only received purchases can be cancelled");
    for(const item of purchase.items){const received=receivedPackageQuantity(item);const batch=await InventoryBatch.findOne({productId:item.productId,batchNumber:item.batchNumber}).session(session);if(!batch||Number(batch.sealedPackages)<received)throw new Error(`This purchase cannot be cancelled because some ${item.name} stock has already been sold, opened, or consumed. Use a purchase return or stock adjustment instead.`);const product=await Product.findById(item.productId).session(session);const previousStock=await productStock(product,session);batch.sealedPackages-=received;if(batch.sealedPackages===0&&Number(batch.openQuantity||0)===0)batch.status="EXHAUSTED";await batch.save({session});const packageSize=Number(item.productSnapshot?.packageSize||batch.packageSize);await StockTransaction.create([{productId:item.productId,batchId:batch._id,type:"PURCHASE_CANCEL",baseQuantity:received*packageSize,packageQuantity:received,unit:item.productSnapshot?.baseUnit,direction:"OUT",previousStock,newStock:previousStock-received*packageSize,referenceType:"PURCHASE",referenceId:purchase._id,reason:"Purchase cancelled",note:text(reason)||purchase.purchaseNumber,actorId}],{session,ordered:true});}
    purchase.purchaseStatus="CANCELLED";purchase.cancelledAt=new Date();purchase.cancelledBy=actorId;purchase.cancellationReason=text(reason);purchase.balanceDue=0;await purchase.save({session});await Expense.deleteOne({source:"PURCHASE",referenceId:purchase._id}).session(session);
  });return purchase;}finally{await session.endSession();}
}

const escapeRegex=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const startOfDay=(value)=>{const date=new Date(value);date.setHours(0,0,0,0);return date;};
const endOfDay=(value)=>{const date=new Date(value);date.setHours(23,59,59,999);return date;};

export async function getPurchases(parameters){
  const filter={};const search=text(parameters.get("search"));if(search){const regex=new RegExp(escapeRegex(search),"i");filter.$or=[{purchaseNumber:regex},{supplierInvoiceNumber:regex},{"supplierSnapshot.name":regex},{"items.name":regex},{"items.productSnapshot.sku":regex},{"items.batchNumber":regex}];}
  const suppliers=queryValues(parameters,"supplier").filter(mongoose.isValidObjectId).map((value)=>new mongoose.Types.ObjectId(value));if(suppliers.length)filter.supplierId={$in:suppliers};
  const paymentStatuses=queryValues(parameters,"paymentStatus",["PAID","PARTIAL","UNPAID"]);if(paymentStatuses.length)filter.paymentStatus={$in:paymentStatuses};
  const purchaseStatuses=queryValues(parameters,"purchaseStatus",["DRAFT","RECEIVED","CANCELLED"]);if(purchaseStatuses.length)filter.purchaseStatus={$in:purchaseStatuses};
  const dateFrom=parameters.get("dateFrom"),dateTo=parameters.get("dateTo");if(dateFrom||dateTo)filter.purchasedAt={...(dateFrom?{$gte:startOfDay(dateFrom)}:{}),...(dateTo?{$lte:endOfDay(dateTo)}:{})};
  const page=Math.max(1,Number(parameters.get("page"))||1),limit=Math.min(100,Math.max(1,Number(parameters.get("limit"))||20));const order=parameters.get("order")==="asc"?1:-1;const sortKey={date:"purchasedAt",supplier:"supplierSnapshot.name",total:"total",paymentStatus:"paymentStatus"}[parameters.get("sort")]||"purchasedAt";
  const now=new Date(),today=startOfDay(now),monthStart=new Date(now.getFullYear(),now.getMonth(),1);const active={$ne:"CANCELLED"};
  const [rows,count,todaySummary,monthSummary,outstanding]=await Promise.all([
    Purchase.find(filter).populate("supplierId","name phone email taxNumber").sort({[sortKey]:order,createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),Purchase.countDocuments(filter),
    Purchase.aggregate([{$match:{purchaseStatus:active,purchasedAt:{$gte:today}}},{$group:{_id:null,value:{$sum:"$total"},count:{$sum:1}}}]),
    Purchase.aggregate([{$match:{purchaseStatus:active,purchasedAt:{$gte:monthStart}}},{$group:{_id:null,value:{$sum:"$total"},packages:{$sum:{$sum:{$map:{input:"$items",as:"item",in:{$add:["$$item.packageQuantity",{$ifNull:["$$item.freeQuantity",0]}]}}}}}}}]),
    Purchase.aggregate([{$match:{purchaseStatus:"RECEIVED"}},{$group:{_id:null,value:{$sum:"$balanceDue"}}}]),
  ]);
  return{rows,pagination:{page,limit,total:count,pages:Math.max(1,Math.ceil(count/limit))},kpis:{todayValue:todaySummary[0]?.value||0,todayCount:todaySummary[0]?.count||0,monthValue:monthSummary[0]?.value||0,monthPackages:monthSummary[0]?.packages||0,outstanding:outstanding[0]?.value||0},paymentMethods:PURCHASE_PAYMENT_METHODS};
}

export async function getPurchaseDetails(id){const purchase=await Purchase.findById(id).populate("supplierId","name phone email address taxNumber code").populate("items.productId","name sku packageType packageSize baseUnit batchTracking expiryTracking").lean();if(!purchase)throw new Error("Purchase not found");const stockEntries=await StockTransaction.find({referenceType:"PURCHASE",referenceId:purchase._id}).populate("productId","name sku packageType packageSize baseUnit").populate("batchId","batchNumber expiryDate").sort({createdAt:1}).lean();return{...purchase,stockEntries};}
