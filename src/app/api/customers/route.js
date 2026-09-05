import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, apiError } from "@/lib/api";
import { Customer } from "@/models";
import {createCustomer,escapeRegex,normalizePhone} from "@/services/customer.service";
import {queryValues} from "@/lib/filter-utils";

const bounded=(value,fallback,min,max)=>Math.min(max,Math.max(min,Number(value)||fallback));
const sortFields={name:"name",purchases:"purchaseCount",totalSpent:"totalSpent",averageBill:"averageBill",lastPurchase:"lastPurchaseAt",createdAt:"createdAt"};
const activeMatch=(status)=>status==="INACTIVE"?{$or:[{status:"INACTIVE"},{active:false}]}:status==="ALL"?{}:{$or:[{status:"ACTIVE"},{status:{$exists:false},active:{$ne:false}}]};
const withCustomerType=(match,customerType)=>{if(customerType==="WHOLESALE")match.customerType="WHOLESALE";if(customerType==="RETAIL")match.$and=[...(match.$and||[]),{$or:[{customerType:"RETAIL"},{customerType:{$exists:false}}]}];return match};
const saleStats=()=>[{$lookup:{from:"sales",localField:"_id",foreignField:"customerId",as:"customerSales"}},{$addFields:{purchaseCount:{$size:"$customerSales"},totalSpent:{$sum:"$customerSales.total"},averageBill:{$cond:[{$gt:[{$size:"$customerSales"},0]},{$avg:"$customerSales.total"},0]},highestBill:{$ifNull:[{$max:"$customerSales.total"},0]},firstPurchaseAt:{$min:"$customerSales.createdAt"},lastPurchaseAt:{$max:"$customerSales.createdAt"}}},{$unset:"customerSales"}];

export async function GET(request) {
  try {
    await requireSession("customers.view");await connectDb();
    const params=new URL(request.url).searchParams,q=String(params.get("q")||params.get("search")||"").trim(),page=bounded(params.get("page"),1,1,100000),limit=bounded(params.get("limit"),20,1,500),status=String(params.get("status")||"ACTIVE").toUpperCase(),quick=String(params.get("quick")||"ALL").toUpperCase(),customerType=String(params.get("customerType")||"").toUpperCase(),highValue=bounded(params.get("highValue"),10000,1,100000000);
    const base=withCustomerType(activeMatch(quick==="INACTIVE"?"INACTIVE":status),customerType),safe=escapeRegex(q),phone=normalizePhone(q);
    if(q)base.$and=[...(base.$and||[]),{$or:[{name:{$regex:safe,$options:"i"}},{businessName:{$regex:safe,$options:"i"}},{gstin:{$regex:safe,$options:"i"}},{phone:{$regex:safe,$options:"i"}},{email:{$regex:safe,$options:"i"}},...(phone.length>=4?[{normalizedPhone:{$regex:`${escapeRegex(phone)}$`}}]:[])]}];
    const pipeline=[{$match:base},...saleStats()],startMonth=new Date();startMonth.setDate(1);startMonth.setHours(0,0,0,0);
    if(quick==="NEW")pipeline.push({$match:{createdAt:{$gte:startMonth}}});if(quick==="REPEAT")pipeline.push({$match:{purchaseCount:{$gte:2}}});if(quick==="HIGH_VALUE")pipeline.push({$match:{totalSpent:{$gte:highValue}}});
    const spending=queryValues(params,"spending"),purchases=queryValues(params,"purchaseCount"),last=queryValues(params,"lastPurchase");
    const spendRanges={UNDER_1000:{totalSpent:{$lt:1000}},"1000_5000":{totalSpent:{$gte:1000,$lte:5000}},"5000_10000":{totalSpent:{$gt:5000,$lte:10000}},ABOVE_10000:{totalSpent:{$gt:10000}}};const selectedSpendRanges=spending.map((value)=>spendRanges[value]).filter(Boolean);if(selectedSpendRanges.length)pipeline.push({$match:{$or:selectedSpendRanges}});
    const purchaseRanges={"1":{purchaseCount:1},"2_5":{purchaseCount:{$gte:2,$lte:5}},"6_10":{purchaseCount:{$gte:6,$lte:10}},"10_PLUS":{purchaseCount:{$gt:10}}};const selectedPurchaseRanges=purchases.map((value)=>purchaseRanges[value]).filter(Boolean);if(selectedPurchaseRanges.length)pipeline.push({$match:{$or:selectedPurchaseRanges}});
    const lastPurchaseRanges=last.map((value)=>{const since=new Date();if(value==="TODAY")since.setHours(0,0,0,0);if(value==="7_DAYS")since.setDate(since.getDate()-7);if(value==="30_DAYS")since.setDate(since.getDate()-30);if(value==="3_MONTHS"||value==="NO_RECENT")since.setMonth(since.getMonth()-3);return value==="NO_RECENT"?{$or:[{lastPurchaseAt:null},{lastPurchaseAt:{$lt:since}}]}:["TODAY","7_DAYS","30_DAYS","3_MONTHS"].includes(value)?{lastPurchaseAt:{$gte:since}}:null;}).filter(Boolean);if(lastPurchaseRanges.length)pipeline.push({$match:{$or:lastPurchaseRanges}});
    const sortKey=sortFields[params.get("sort")]||"lastPurchaseAt",direction=params.get("order")==="asc"?1:-1;pipeline.push({$sort:{[sortKey]:direction,_id:1}},{$facet:{rows:[{$skip:(page-1)*limit},{$limit:limit}],count:[{$count:"value"}]}});
    const[result]=await Customer.aggregate(pipeline),total=result?.count?.[0]?.value||0,[kpi]=await Customer.aggregate([{$match:withCustomerType(activeMatch("ACTIVE"),customerType)},...saleStats(),{$group:{_id:null,totalCustomers:{$sum:1},newThisMonth:{$sum:{$cond:[{$gte:["$createdAt",startMonth]},1,0]}},repeatCustomers:{$sum:{$cond:[{$gte:["$purchaseCount",2]},1,0]}},customerRevenue:{$sum:"$totalSpent"},averageCustomerSpend:{$avg:"$totalSpent"}}}]);
    return ok({rows:result?.rows||[],meta:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},kpis:kpi||{totalCustomers:0,newThisMonth:0,repeatCustomers:0,customerRevenue:0,averageCustomerSpend:0},highValueThreshold:highValue});
  } catch (error) { return apiError(error); }
}

export async function POST(request) {try {await requireSession("customers.create");await connectDb();return ok(await createCustomer(await request.json()),201);} catch (error) {return apiError(error);}}
