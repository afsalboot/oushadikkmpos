import mongoose from 'mongoose';
import {Sale,SalesHistoryLedger,DailySalesSummary,DailyProductSalesSummary,DailyCustomerSalesSummary,SalesRetentionState,SalesRetentionRun,FiscalGuard,AuditLog,Settings,Product} from '../models/index.js';
import {RETENTION_VERSION,retentionConflict,retentionEligible,sourceMatchesHistory,saleExpiry,saleBusinessDate,businessDay,saleSourceHash,saleAnalyticsFacts,dailyContribution,productContributions,deltaMetrics,sumMetrics,sameMetrics,invoiceIdentity} from '../lib/sale-retention.js';
import {requestHash} from '../lib/fiscal-integrity.js';
import {dashboardInventoryPipeline} from '../lib/dashboard-inventory-pipeline.js';

const summaryModels=[SalesHistoryLedger,DailySalesSummary,DailyProductSalesSummary,DailyCustomerSalesSummary,SalesRetentionState,SalesRetentionRun];
let initialization;
export async function initializeRetentionModels(){
  if(!initialization)initialization=(async()=>{
    const indexes=await Sale.collection.listIndexes().toArray().catch(error=>{if(error.code===26)return [];throw error;});
    if(indexes.some(index=>index.expireAfterSeconds!==undefined))throw retentionConflict('A Sale TTL index exists; remove it through a reviewed migration before enabling retention');
    await Sale.createCollection();
    await Promise.all(summaryModels.map(async model=>{await model.createCollection();await model.createIndexes();}));
    await Sale.collection.createIndex({retentionStoreId:1,retentionProcessed:1,expiresAt:1,_id:1},{name:'sale_retention_candidates'});
  })().catch(error=>{initialization=null;throw error;});
  return initialization;
}
const metricUpdate=delta=>Object.fromEntries(Object.entries(delta).filter(([,value])=>value!==0).map(([key,value])=>['metrics.'+key,value]));
export function createSaleRetentionService(models){
  const {Sale,SalesHistoryLedger,DailySalesSummary,DailyProductSalesSummary,DailyCustomerSalesSummary,SalesRetentionState,SalesRetentionRun,FiscalGuard,AuditLog,Settings,Product,transaction}=models;
  const store=settings=>{if(!settings?._id)throw retentionConflict('Persisted store identity is required');if(settings.dataRetention?.saleRetentionDays!==undefined&&settings.dataRetention.saleRetentionDays!==90)throw retentionConflict('Sales retention is fixed at 90 days');return String(settings._id);};
  const fence=async session=>FiscalGuard.findOneAndUpdate({key:'issuance'},{$inc:{revision:1}},{upsert:true,session});
  async function customerSummary(storeId,date,customerId,session){
    if(!customerId)return;
    const [row]=await SalesHistoryLedger.aggregate([{$match:{storeId,date,'facts.customerId':customerId}},{$group:{_id:null,salesCount:{$sum:1},totalSpentCents:{$sum:{$round:[{$multiply:['$facts.total',100]},0]}},highestBillCents:{$max:{$round:[{$multiply:['$facts.total',100]},0]}},firstPurchaseAt:{$min:'$facts.createdAt'},lastPurchaseAt:{$max:'$facts.createdAt'}}}]).session(session);
    await DailyCustomerSalesSummary.updateOne({storeId,date,customerId},{$set:row?{salesCount:row.salesCount,totalSpentCents:row.totalSpentCents,highestBillCents:row.highestBillCents,firstPurchaseAt:row.firstPurchaseAt,lastPurchaseAt:row.lastPurchaseAt}:{salesCount:0,totalSpentCents:0,highestBillCents:0,firstPurchaseAt:null,lastPurchaseAt:null}},{upsert:true,session});
  }
  async function changeDay(storeId,date,previous={},next={},session){
    const inc=metricUpdate(deltaMetrics(previous,next));
    await DailySalesSummary.updateOne({storeId,date},{$set:{version:RETENTION_VERSION},...(Object.keys(inc).length?{$inc:inc}:{})},{upsert:true,session});
  }
  async function changeProducts(storeId,date,previous=[],next=[],session){
    const old=new Map(previous.map(row=>[row.productKey,row])),current=new Map(next.map(row=>[row.productKey,row]));
    for(const key of new Set([...old.keys(),...current.keys()])){
      const row=current.get(key)||old.get(key),keys=['salesCount','packageQuantity','looseQuantity','mixQuantity','wholesalePaid','wholesaleFree','revenueCents'];
      const metric=source=>Object.fromEntries(keys.map(key=>[key,source?.[key]||0]));
      const inc=metricUpdate(deltaMetrics(metric(old.get(key)),metric(current.get(key))));
      await DailyProductSalesSummary.updateOne({storeId,date,productKey:key},{$set:{productId:row.productId,name:row.name,unit:row.unit},...(Object.keys(inc).length?{$inc:inc}:{})},{upsert:true,session});
    }
  }
  async function sync({sale,settings,session}){
    const document=sale.toObject?.()||sale,storeId=store(settings),date=businessDay(document),sourceHash=saleSourceHash(document);
    const prior=await SalesHistoryLedger.findById(document._id).session(session).lean();
    if(prior&&prior.storeId!==storeId)throw retentionConflict('Historical sale belongs to another store');
    if(prior?.purgedAt)throw retentionConflict('A permanently deleted bill cannot be reconstructed');
    if(prior?.sourceHash===sourceHash&&requestHash(prior.facts)===requestHash(saleAnalyticsFacts(document))&&sameMetrics(prior.metrics,dailyContribution(prior.facts))&&requestHash(prior.productMetrics)===requestHash(productContributions(prior.facts))){
      const marked=await Sale.collection.updateOne({_id:document._id,updatedAt:document.updatedAt},{$set:{retentionProcessed:true,retentionStoreId:storeId,retentionHash:sourceHash,expiresAt:saleExpiry(document)}},{session});
      if(marked.matchedCount!==1)throw retentionConflict('Sale changed while preparing permanent history');
      return prior;
    }
    const facts=saleAnalyticsFacts(document),metrics=dailyContribution(facts),productMetrics=productContributions(facts);
    if(prior&&prior.date!==date){await changeDay(storeId,prior.date,prior.metrics,{},session);await changeProducts(storeId,prior.date,prior.productMetrics,[],session);}
    await changeDay(storeId,date,prior?.date===date?prior.metrics:{},metrics,session);
    await changeProducts(storeId,date,prior?.date===date?prior.productMetrics:[],productMetrics,session);
    const record={storeId,date,saleDate:saleBusinessDate(document),expiresAt:saleExpiry(document),version:RETENTION_VERSION,sourceHash,facts,metrics,productMetrics,actorId:document.actorId,invoiceHash:invoiceIdentity(storeId,document.invoiceNumber),...(document.requestKey?{requestKey:document.requestKey,requestHash:document.requestHash}:{})};
    await SalesHistoryLedger.updateOne({_id:document._id},{$set:record,$unset:{dashboardCost:''}},{upsert:true,session});
    if(prior?.facts.customerId)await customerSummary(storeId,prior.date,prior.facts.customerId,session);
    if(facts.customerId)await customerSummary(storeId,date,facts.customerId,session);
    const marked=await Sale.collection.updateOne({_id:document._id,updatedAt:document.updatedAt},{$set:{retentionProcessed:true,retentionStoreId:storeId,retentionHash:sourceHash,expiresAt:record.expiresAt}},{session});
    if(marked.matchedCount!==1)throw retentionConflict('Sale changed while preparing permanent history');
    return record;
  }
  async function preview(now=new Date()){
    const settings=await Settings.findOne({key:'global'}).lean(),storeId=store(settings),cutoffDate=new Date(now.getTime()-90*86400000);
    const scope={$or:[{retentionStoreId:storeId},{retentionStoreId:{$exists:false}}]};
    const age={$expr:{$lt:[{$ifNull:['$invoiceDate','$createdAt']},cutoffDate]}};
    const [detailed,olderThan60Days,old,state,lastRun,range]=await Promise.all([
      Sale.countDocuments(scope),Sale.countDocuments({...scope,$expr:{$lt:[{$ifNull:['$invoiceDate','$createdAt']},new Date(now.getTime()-60*86400000)]}}),
      Sale.aggregate([{$match:{...scope,...age}},{$group:{_id:null,count:{$sum:1},processed:{$sum:{$cond:[{$eq:['$retentionProcessed',true]},1,0]}},oldest:{$min:{$ifNull:['$invoiceDate','$createdAt']}},newest:{$max:{$ifNull:['$invoiceDate','$createdAt']}}}}]),
      SalesRetentionState.findOne({storeId}).lean(),SalesRetentionRun.findOne({storeId}).sort({startedAt:-1}).lean(),
      Sale.aggregate([{$match:scope},{$group:{_id:null,oldest:{$min:{$ifNull:['$invoiceDate','$createdAt']}}}}]),
    ]);
    return {storeId,retentionDays:90,cutoffDate,detailed,olderThan60Days,eligibleByAge:old[0]?.count||0,processedOldBills:old[0]?.processed||0,oldestSale:range[0]?.oldest||null,newestEligibleSale:old[0]?.newest||null,validated:state?.validationVersion===RETENTION_VERSION&&!!state.validatedAt,cleanupEnabled:process.env.SALES_RETENTION_CLEANUP_ENABLED==='1'&&settings.dataRetention?.enabled!==false,lastRun:lastRun||null};
  }
  async function rebuild({afterId,limit=100}={}){
    const settings=await Settings.findOne({key:'global'}).lean(),storeId=store(settings);
    const filter={$or:[{retentionStoreId:storeId},{retentionStoreId:{$exists:false}}],...(afterId?{_id:{$gt:afterId}}:{})};
    const rows=await Sale.find(filter).sort({_id:1}).limit(Math.min(200,Math.max(1,limit))).select('_id').lean();
    const dates=new Set();
    for(const row of rows)await transaction(async session=>{await fence(session);const sale=await Sale.findById(row._id).session(session).lean();if(sale)dates.add((await sync({sale,settings,session})).date);});
    // Deterministic repair also handles partially prepared or damaged summaries.
    for(const date of dates)await transaction(async session=>{await fence(session);await reconcileDay(storeId,date,session);});
    return {processed:rows.length,next:rows.length?String(rows.at(-1)._id):null,complete:rows.length<Math.min(200,Math.max(1,limit))};
  }
  async function calculateDay(storeId,date,session){
    // Stream bills rather than loading an entire day's sales into memory.
    let expected={};const products=new Map(),customers=new Map(),definitions=new Map();
    for await(const entry of SalesHistoryLedger.find({storeId,date}).session(session).lean().cursor({batchSize:100})){
      if(entry.version!==RETENTION_VERSION||!sameMetrics(entry.metrics,dailyContribution(entry.facts)))throw retentionConflict('Historical contribution validation failed');
      expected=sumMetrics([expected,entry.metrics]);
      for(const row of productContributions(entry.facts)){const {productKey,productId,name,unit,...metrics}=row;definitions.set(productKey,{productId,name,unit});products.set(productKey,sumMetrics([products.get(productKey)||{},metrics]));}
      if(entry.facts.customerId){const key=String(entry.facts.customerId),row=customers.get(key)||{count:0,total:0,highest:0,first:Infinity,last:-Infinity};row.count++;row.total+=Math.round(Number(entry.facts.total)*100);row.highest=Math.max(row.highest,Math.round(Number(entry.facts.total)*100));row.first=Math.min(row.first,+new Date(entry.facts.createdAt));row.last=Math.max(row.last,+new Date(entry.facts.createdAt));customers.set(key,row);}
    }
    return {expected,products,customers,definitions};
  }
  async function reconcileDay(storeId,date,session){
    const {expected,products,customers,definitions}=await calculateDay(storeId,date,session);
    await DailySalesSummary.updateOne({storeId,date},{$set:{metrics:expected,version:RETENTION_VERSION}},{upsert:true,session});
    for(const [productKey,metrics]of products)await DailyProductSalesSummary.updateOne({storeId,date,productKey},{$set:{...definitions.get(productKey),metrics}},{upsert:true,session});
    await DailyProductSalesSummary.deleteMany({storeId,date,productKey:{$nin:[...products.keys()]}},{session});
    for(const [id,row]of customers)await DailyCustomerSalesSummary.updateOne({storeId,date,customerId:id},{$set:{salesCount:row.count,totalSpentCents:row.total,highestBillCents:row.highest,firstPurchaseAt:new Date(row.first),lastPurchaseAt:new Date(row.last)}},{upsert:true,session});
    await DailyCustomerSalesSummary.deleteMany({storeId,date,customerId:{$nin:[...customers.keys()]}},{session});
  }
  async function validateDay(storeId,date,session){
    const {expected,products,customers}=await calculateDay(storeId,date,session);
    const summary=await DailySalesSummary.findOne({storeId,date}).session(session).lean();
    if(!summary||summary.version!==RETENTION_VERSION||!sameMetrics(summary.metrics,expected))throw retentionConflict('Daily summary is missing or does not reconcile');
    const actual=await DailyProductSalesSummary.find({storeId,date}).session(session).lean();
    if([...products].some(([key,value])=>!sameMetrics(actual.find(row=>row.productKey===key)?.metrics,value))||actual.some(row=>!products.has(row.productKey)&&Object.values(row.metrics).some(Boolean)))throw retentionConflict('Product summaries do not reconcile');
    const customerRows=await DailyCustomerSalesSummary.find({storeId,date}).session(session).lean();
    if([...customers].some(([key,v])=>{const row=customerRows.find(row=>String(row.customerId)===key);return !row||row.salesCount!==v.count||row.totalSpentCents!==v.total||row.highestBillCents!==v.highest||+new Date(row.firstPurchaseAt)!==v.first||+new Date(row.lastPurchaseAt)!==v.last;}))throw retentionConflict('Customer summaries do not reconcile');
    if(customerRows.some(row=>!customers.has(String(row.customerId))&&(row.salesCount||row.totalSpentCents||row.highestBillCents)))throw retentionConflict('Unexpected customer summary');
    return {expected};
  }
  async function validate({limit=100,restart=false}={}){
    const settings=await Settings.findOne({key:'global'}).lean(),storeId=store(settings);
    return transaction(async session=>{
      await fence(session);
      const pending=await Sale.exists({$or:[{retentionProcessed:{$ne:true}},{retentionStoreId:{$ne:storeId}}]}).session(session);
      if(pending)throw retentionConflict('Backfill is incomplete; detailed sales remain unprocessed');
      const state=await SalesRetentionState.findOne({storeId}).session(session).lean();
      const afterId=!restart&&state?.validationInProgress?state.validationCursor:null;
      const batchLimit=Math.min(200,Math.max(1,limit));
      const rows=await SalesHistoryLedger.find({storeId,...(afterId?{_id:{$gt:afterId}}:{})}).sort({_id:1}).limit(batchLimit).session(session).lean();
      const details=await Sale.find({_id:{$in:rows.map(row=>row._id)}}).session(session).lean(),byId=new Map(details.map(row=>[String(row._id),row]));
      for(const row of rows){const sale=byId.get(String(row._id));if(!sale&&!row.purgedAt)throw retentionConflict('History has no detailed sale or purge marker');if(sale&&!sourceMatchesHistory(sale,row))throw retentionConflict('Detailed sales and historical facts do not reconcile');}
      const dates=[...new Set(rows.map(row=>row.date))];for(const date of dates)await validateDay(storeId,date,session);
      const complete=rows.length<batchLimit,validatedAt=complete?new Date():null;
      if(complete){
        const missing=await Sale.aggregate([{$lookup:{from:SalesHistoryLedger.collection.name,localField:'_id',foreignField:'_id',pipeline:[{$match:{storeId}}],as:'history'}},{$match:{$expr:{$eq:[{$size:'$history'},0]}}},{$limit:1},{$project:{_id:1}}]).session(session);
        if(missing.length)throw retentionConflict('Detailed sale is missing its permanent history contribution');
        const ledgerDates=new Set(await SalesHistoryLedger.distinct('date',{storeId}).session(session));
        for(const date of await DailySalesSummary.distinct('date',{storeId}).session(session))if(!ledgerDates.has(date))await validateDay(storeId,date,session);
      }
      await SalesRetentionState.updateOne({storeId},{$set:{validatedAt,validationVersion:complete?RETENTION_VERSION:0,validationInProgress:!complete,validationCursor:rows.at(-1)?._id||afterId||null}},{upsert:true,session});
      return {validated:complete,complete,storeId,days:dates.length,checked:details.length,next:rows.at(-1)?String(rows.at(-1)._id):null,validatedAt};
    });
  }
  async function freezeCost(ledgers,session){
    const ids=[...new Map(ledgers.flatMap(row=>row.facts.items.flatMap(item=>[item.productId,...(item.ingredients||[]).map(i=>i.productId),item.freeProductId]).filter(Boolean)).map(id=>[String(id),id])).values()];
    const [facets]=ids.length?await Product.aggregate(dashboardInventoryPipeline(ids)).session(session):[],products=facets?.costProducts||[];
    const costs=new Map(products.map(p=>[String(p._id),p]));
    for(const row of ledgers){let rawCost=0;for(const item of row.facts.items){if(item.kind==='MIX')for(const ingredient of item.ingredients||[])rawCost+=Number(ingredient.baseQuantity||0)*Number(costs.get(String(ingredient.productId))?.unitCost||0);else{const p=costs.get(String(item.productId)),free=costs.get(String(item.freeProductId||item.productId)),freeSize=free?Number(free.packageSize||0):Number(p?.packageSize||0);rawCost+=Number(item.baseQuantity||0)*Number(p?.unitCost||0)+Number(item.freeQuantity||0)*(item.saleMode==='LOOSE'?1:freeSize)*Number(free?.unitCost||0);}}
      await SalesHistoryLedger.updateOne({_id:row._id,storeId:row.storeId},{$set:{dashboardCost:rawCost}},{session});}
  }
  async function cleanup({now=new Date(),limit=100}={}){
    const settings=await Settings.findOne({key:'global'}).lean(),storeId=store(settings);
    if(process.env.SALES_RETENTION_CLEANUP_ENABLED!=='1'||settings.dataRetention?.enabled===false)return {status:'DISABLED',deleted:0};
    const state=await SalesRetentionState.findOne({storeId}).lean();
    if(!state?.validatedAt||state.validationVersion!==RETENTION_VERSION)throw retentionConflict('Cleanup is locked until summaries are rebuilt and validated');
    const log={storeId,startedAt:now,retentionDays:90,cutoffDate:new Date(now.getTime()-90*86400000),found:0,deleted:0,skipped:0,errorsCount:0,status:'RUNNING'};
    try{
      await transaction(async session=>{
        await fence(session);
        const currentState=await SalesRetentionState.findOne({storeId}).session(session).lean();
        if(!currentState?.validatedAt||currentState.validationVersion!==RETENTION_VERSION)throw retentionConflict('Cleanup validation lock changed');
        const candidates=await Sale.find({retentionStoreId:storeId,retentionProcessed:true,expiresAt:{$lt:now}}).sort({expiresAt:1,_id:1}).limit(Math.min(500,Math.max(1,limit))).session(session).lean();
        log.found=candidates.length;
        const ledgers=await SalesHistoryLedger.find({_id:{$in:candidates.map(sale=>sale._id)},storeId}).session(session).lean(),byId=new Map(ledgers.map(row=>[String(row._id),row]));
        const eligible=candidates.filter(sale=>retentionEligible(sale,byId.get(String(sale._id)),now));log.skipped=candidates.length-eligible.length;
        if(log.skipped)throw retentionConflict('Candidate bills failed validation; rebuild and validate before retrying cleanup');
        const dates=[...new Set(eligible.map(businessDay))];for(const date of dates)await validateDay(storeId,date,session);
        const ids=eligible.map(sale=>sale._id);
        if(ids.length){
          await freezeCost(ids.map(id=>byId.get(String(id))),session);
          // Raw collection deletion deliberately bypasses all Mongoose/business hooks.
          const result=await Sale.collection.deleteMany({_id:{$in:ids},retentionStoreId:storeId,retentionProcessed:true,expiresAt:{$lt:now}},{session});
          if(result.deletedCount!==ids.length)throw retentionConflict('Concurrent sale changes prevented cleanup');
          await SalesHistoryLedger.updateMany({_id:{$in:ids},storeId},{$set:{purgedAt:now}},{session});
          // Edit audits otherwise retain entire before/after invoice snapshots.
          await AuditLog.updateMany({targetType:'Sale',targetId:{$in:ids},action:'SALE_EDITED'},{$unset:{'metadata.before':'','metadata.after':''},$set:{'metadata.retentionPurged':true}},{session});
          await SalesRetentionState.updateOne({storeId},{$set:{lastCleanupAt:now},$inc:{totalDeleted:ids.length}},{session});
          log.deleted=ids.length;
        }
      });log.status='COMPLETED';
    }catch(error){log.deleted=0;log.errorsCount=1;log.status='FAILED';log.errorCode='RETENTION_VALIDATION_OR_TRANSACTION_FAILED';throw error;}
    finally{log.completedAt=new Date();await SalesRetentionRun.create(log);await SalesRetentionRun.deleteMany({storeId,_id:{$nin:(await SalesRetentionRun.find({storeId}).sort({startedAt:-1}).limit(30).select('_id').lean()).map(row=>row._id)}});}
    return log;
  }
  async function remapProducts({sourceIds,targetId,settings,session}){
    const storeId=store(settings),ids=new Set(sourceIds.map(String));
    for await(const row of SalesHistoryLedger.find({storeId,purgedAt:{$ne:null},$or:[{'facts.items.productId':{$in:sourceIds}},{'facts.items.freeProductId':{$in:sourceIds}},{'facts.items.ingredients.productId':{$in:sourceIds}}]}).session(session).lean().cursor({batchSize:100})){
      for(const item of row.facts.items){for(const field of ['productId','freeProductId'])if(ids.has(String(item[field])))item[field]=targetId;for(const ingredient of item.ingredients||[])if(ids.has(String(ingredient.productId)))ingredient.productId=targetId;}
      const productMetrics=productContributions(row.facts);await changeProducts(storeId,row.date,row.productMetrics,productMetrics,session);
      await SalesHistoryLedger.updateOne({_id:row._id,storeId},{$set:{facts:row.facts,productMetrics}},{session});
    }
  }
  return {sync,preview,rebuild,validate,cleanup,validateDay,remapProducts};
}
const service=createSaleRetentionService({Sale,SalesHistoryLedger,DailySalesSummary,DailyProductSalesSummary,DailyCustomerSalesSummary,SalesRetentionState,SalesRetentionRun,FiscalGuard,AuditLog,Settings,Product,transaction:work=>mongoose.connection.transaction(work,{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}})});
export const syncSaleHistory=service.sync;
export const previewSaleRetention=service.preview;
export const rebuildSaleHistory=service.rebuild;
export const validateSaleHistory=service.validate;
export const cleanupSaleHistory=service.cleanup;
export const remapSaleHistoryProducts=service.remapProducts;
