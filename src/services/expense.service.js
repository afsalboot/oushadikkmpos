import mongoose from "mongoose";
import {DocumentCounter,Expense,ExpenseCategory,Purchase,User} from "@/models";
import {maxDocumentSequence,nextDocumentNumber} from "@/services/document-number.service";
import {queryValues} from "@/lib/filter-utils";

export const EXPENSE_PAYMENT_METHODS=["CASH","UPI","CARD","BANK"];
const money=(value)=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const text=(value)=>String(value??"").trim();
const escapeRegex=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const startOfDay=(value)=>{const date=new Date(value);date.setHours(0,0,0,0);return date;};
const endOfDay=(value)=>{const date=new Date(value);date.setHours(23,59,59,999);return date;};
const accountAmount=(expense)=>money(expense.source==="PURCHASE"&&expense.paidAmount!==undefined?expense.paidAmount:expense.amount);

async function nextExpenseNumber(value,session){const prior=await Expense.find({expenseNumber:/-(\d+)$/}).select("expenseNumber").session(session).lean();return nextDocumentNumber({Counter:DocumentCounter,prefix:"EXP",value,session,minimumSequence:maxDocumentSequence(prior.map((entry)=>entry.expenseNumber))});}

async function normalizeManualExpense(body,session){
  if(!mongoose.isValidObjectId(body.categoryId))throw new Error("Select an expense category");
  const category=await ExpenseCategory.findOne({_id:body.categoryId,active:true,type:"MANUAL"}).session(session);if(!category)throw new Error("Select an active manual expense category");
  const title=text(body.title);if(!title)throw new Error("Expense title is required");
  const amount=money(body.amount);if(!Number.isFinite(amount)||amount<=0)throw new Error("Expense amount must be greater than zero");
  const expenseDate=body.expenseDate?new Date(body.expenseDate):new Date();if(Number.isNaN(expenseDate.getTime()))throw new Error("Enter a valid expense date");if(expenseDate>endOfDay(new Date()))throw new Error("Expense date cannot be in the future");
  const paymentMethod=text(body.paymentMethod||"CASH").toUpperCase();if(!EXPENSE_PAYMENT_METHODS.includes(paymentMethod))throw new Error("Select a valid payment method");
  let staff=null;if(category.name.toLowerCase()==="salary"){if(!mongoose.isValidObjectId(body.staffId))throw new Error("Select an employee for the salary expense");staff=await User.findOne({_id:body.staffId,active:true,role:"STAFF"}).select("name email role").session(session);if(!staff)throw new Error("Selected employee is unavailable");}
  return{categoryId:category._id,category:category.name,title,description:text(body.description),amount,expenseDate,paymentMethod,paymentReference:paymentMethod==="CASH"?"":text(body.paymentReference),paidTo:text(body.paidTo),notes:text(body.notes),staffId:staff?staff._id:null,staffSnapshot:staff?{name:staff.name,email:staff.email,role:staff.role}:null};
}

export async function createManualExpense(body,auth){const session=await mongoose.startSession();let expense;try{await session.withTransaction(async()=>{const input=await normalizeManualExpense(body,session);const expenseNumber=await nextExpenseNumber(input.expenseDate,session);[expense]=await Expense.create([{...input,expenseNumber,source:"MANUAL",referenceType:"EXPENSE",actorId:new mongoose.Types.ObjectId(auth.sub),creatorSnapshot:{name:auth.name,role:auth.role},status:"ACTIVE"}],{session,ordered:true});});return expense;}finally{await session.endSession();}}

export async function updateManualExpense(id,body,auth){const session=await mongoose.startSession();let expense;try{await session.withTransaction(async()=>{expense=await Expense.findOne({_id:id,source:"MANUAL",status:{$ne:"VOID"}}).session(session);if(!expense)throw new Error("Only active manual expenses can be edited");const input=await normalizeManualExpense(body,session);expense.set({...input,editedBy:new mongoose.Types.ObjectId(auth.sub)});await expense.save({session});});return expense;}finally{await session.endSession();}}

export async function voidManualExpense(id,reason,auth){const session=await mongoose.startSession();let expense;try{await session.withTransaction(async()=>{expense=await Expense.findOne({_id:id,source:"MANUAL",status:{$ne:"VOID"}}).session(session);if(!expense)throw new Error("Only active manual expenses can be voided");const voidReason=text(reason);if(!voidReason)throw new Error("A reason is required to void this expense");expense.status="VOID";expense.voidReason=voidReason;expense.voidedAt=new Date();expense.voidedBy=new mongoose.Types.ObjectId(auth.sub);await expense.save({session});});return expense;}finally{await session.endSession();}}

async function attachPurchases(rows){const ids=[...new Set(rows.filter((row)=>row.source==="PURCHASE"&&row.referenceId).map((row)=>String(row.referenceId)))].filter(mongoose.isValidObjectId).map((id)=>new mongoose.Types.ObjectId(id));const purchases=ids.length?await Purchase.find({_id:{$in:ids}}).select("purchaseNumber supplierSnapshot supplierInvoiceNumber purchasedAt paymentStatus paymentMethod amountPaid balanceDue total purchaseStatus").lean():[];const byId=new Map(purchases.map((purchase)=>[String(purchase._id),purchase]));return rows.map((row)=>({...row,accountAmount:accountAmount(row),purchase:byId.get(String(row.referenceId))||null}));}

export async function getExpenses(parameters){
  const filter={};const search=text(parameters.get("search"));if(search){const regex=new RegExp(escapeRegex(search),"i");const users=await User.find({name:regex}).select("_id").lean();const userIds=users.map((user)=>user._id);filter.$or=[{expenseNumber:regex},{title:regex},{description:regex},{category:regex},{paymentReference:regex},{"creatorSnapshot.name":regex},{"staffSnapshot.name":regex},{actorId:{$in:userIds}},{staffId:{$in:userIds}}];}
  const filterCategories=queryValues(parameters,"category");if(filterCategories.length)filter.category={$in:filterCategories};const source=parameters.get("source");if(["MANUAL","PURCHASE"].includes(source))filter.source=source;const paymentMethods=queryValues(parameters,"paymentMethod",EXPENSE_PAYMENT_METHODS);if(paymentMethods.length)filter.paymentMethod={$in:paymentMethods};const staff=queryValues(parameters,"staff").filter(mongoose.isValidObjectId).map((value)=>new mongoose.Types.ObjectId(value));if(staff.length)filter.$and=[{$or:[{actorId:{$in:staff}},{staffId:{$in:staff}}]}];const statuses=queryValues(parameters,"status",["ACTIVE","VOID"]);if(statuses.length)filter.status={$in:statuses};
  const dateFrom=parameters.get("dateFrom"),dateTo=parameters.get("dateTo");if(dateFrom||dateTo)filter.expenseDate={...(dateFrom?{$gte:startOfDay(dateFrom)}:{}),...(dateTo?{$lte:endOfDay(dateTo)}:{})};
  const page=Math.max(1,Number(parameters.get("page"))||1),limit=Math.min(1000,Math.max(1,Number(parameters.get("limit"))||20));const order=parameters.get("order")==="asc"?1:-1;const sortKey={date:"expenseDate",amount:"amount",category:"category",source:"source"}[parameters.get("sort")]||"expenseDate";
  const now=new Date(),today=startOfDay(now),monthStart=new Date(now.getFullYear(),now.getMonth(),1);const financial={$cond:[{$and:[{$eq:["$source","PURCHASE"]},{$ne:[{$type:"$paidAmount"},"missing"]}]},"$paidAmount","$amount"]};
  const [rawRows,count,todayStats,monthStats,sourceStats,categories]=await Promise.all([
    Expense.find(filter).populate("categoryId","name description type active").populate("actorId","name email role").populate("staffId","name email role active").sort({[sortKey]:order,createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),Expense.countDocuments(filter),
    Expense.aggregate([{$match:{status:{$ne:"VOID"},expenseDate:{$gte:today}}},{$group:{_id:null,value:{$sum:financial},count:{$sum:1}}}]),
    Expense.aggregate([{$match:{status:{$ne:"VOID"},expenseDate:{$gte:monthStart}}},{$group:{_id:null,value:{$sum:financial},count:{$sum:1}}}]),
    Expense.aggregate([{$match:{status:{$ne:"VOID"},expenseDate:{$gte:monthStart}}},{$group:{_id:"$source",value:{$sum:financial},count:{$sum:1}}}]),
    Expense.aggregate([{$match:{status:{$ne:"VOID"},expenseDate:{$gte:monthStart}}},{$group:{_id:"$category",value:{$sum:financial},count:{$sum:1}}},{$sort:{value:-1}},{$limit:6}]),
  ]);
  const rows=await attachPurchases(rawRows),sources=Object.fromEntries(sourceStats.map((entry)=>[entry._id,entry]));return{rows,pagination:{page,limit,total:count,pages:Math.max(1,Math.ceil(count/limit))},kpis:{today:todayStats[0]?.value||0,todayCount:todayStats[0]?.count||0,month:monthStats[0]?.value||0,monthCount:monthStats[0]?.count||0,manual:sources.MANUAL?.value||0,purchase:sources.PURCHASE?.value||0},categoryBreakdown:categories.map((entry)=>({name:entry._id||"Uncategorized",value:entry.value,count:entry.count})),paymentMethods:EXPENSE_PAYMENT_METHODS};}

export async function getExpenseDetails(id){const expense=await Expense.findById(id).populate("categoryId","name description type active").populate("actorId","name email role").populate("staffId","name email role active").populate("editedBy","name").populate("voidedBy","name").lean();if(!expense)throw new Error("Expense not found");return (await attachPurchases([expense]))[0];}

export async function getExpenseCategories(includeInactive=false){
  const categories=await ExpenseCategory.find(includeInactive?{}:{active:{$ne:false}}).sort({type:-1,name:1}).lean();
  const counts=categories.length?await Expense.aggregate([
    {$match:{categoryId:{$in:categories.map((category)=>category._id)}}},
    {$group:{_id:"$categoryId",count:{$sum:1},amount:{$sum:"$amount"}}},
  ]):[];
  const byId=new Map(counts.map((entry)=>[String(entry._id),entry]));
  return categories.map((category)=>({...category,expenseCount:byId.get(String(category._id))?.count||0,totalAmount:byId.get(String(category._id))?.amount||0}));
}

export async function createExpenseCategory(body){const name=text(body.name);if(!name)throw new Error("Category name is required");if(name.toLowerCase()==="purchase")throw new Error("Purchase is a protected system category");return ExpenseCategory.create({name,description:text(body.description),type:"MANUAL",active:true});}

export async function updateExpenseCategory(id,body){const category=await ExpenseCategory.findById(id);if(!category)throw new Error("Expense category not found");if(category.type==="SYSTEM")throw new Error("System categories cannot be edited");const name=text(body.name);if(!name)throw new Error("Category name is required");if(name.toLowerCase()==="purchase")throw new Error("Purchase is a protected system category");const oldName=category.name;category.name=name;category.description=text(body.description);if(typeof body.active==="boolean")category.active=body.active;await category.save();if(oldName!==name)await Expense.updateMany({categoryId:category._id},{$set:{category:name}});return category;}

export async function removeExpenseCategory(id){const category=await ExpenseCategory.findById(id);if(!category)throw new Error("Expense category not found");if(category.type==="SYSTEM")throw new Error("System categories cannot be deleted");const count=await Expense.countDocuments({categoryId:category._id});if(count)throw new Error(`This category is used by ${count} expense${count===1?"":"s"}. Deactivate it instead.`);await ExpenseCategory.deleteOne({_id:category._id});return{deleted:true};}

export {nextExpenseNumber};
