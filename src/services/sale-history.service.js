import {Sale,SalesHistoryLedger,SalesRetentionState,Settings} from '../models/index.js';
import {getSettings} from './settings.service.js';
import {invoiceIdentity,retentionGone,saleSourceHash} from '../lib/sale-retention.js';

export async function retentionStoreId(){const settings=await getSettings();if(!settings._storeId)throw new Error('A persisted store identity is required for sales history');return settings._storeId;}
export function salesHistoryPipeline(pipeline=[],storeId){
  const first=pipeline[0]?.$match?[pipeline[0]]:[];
  return [{$match:{$or:[{retentionStoreId:String(storeId)},{retentionStoreId:{$exists:false}}]}},...first,
    {$unionWith:{coll:SalesHistoryLedger.collection.name,pipeline:[{$match:{storeId:String(storeId)}},{$replaceRoot:{newRoot:{$mergeObjects:['$facts',{_id:'$_id',historyOnly:true,retentionEstimatedCost:'$dashboardCost'}]}}},...first]}},
    // Detail wins while it exists; ledger wins after purge. One identifier can
    // never increase totals twice, including a concurrent cleanup/backfill.
    {$group:{_id:'$_id',document:{$first:'$$ROOT'}}},{$replaceRoot:{newRoot:'$document'}},
    ...(first.length?pipeline.slice(1):pipeline),
  ];
}
export async function historicalSalesAggregate(pipeline){return Sale.aggregate(salesHistoryPipeline(pipeline,await retentionStoreId())).allowDiskUse(true).readConcern('snapshot');}
export async function loadHistoricalSales(filter={},sort={createdAt:-1},populate=[]){
  const rows=await historicalSalesAggregate([{$match:filter},{$sort:sort}]);
  if(populate.length)await Sale.populate(rows,populate);
  return rows;
}
export async function findHistoricalRetry(requestKey,hash,actorId,session){
  const entry=await SalesHistoryLedger.findOne({storeId:await retentionStoreId(),requestKey:{$eq:requestKey,$type:'string'}}).session(session||null).lean();
  if(!entry)return;
  if(String(entry.actorId)!==String(actorId)||entry.requestHash!==hash)throw Object.assign(new Error('This checkout key has already been used for a different request'),{status:409});
  if(entry.purgedAt)throw retentionGone();
}
export async function historicalInvoiceExists(number,settings,session){return SalesHistoryLedger.exists({storeId:String(settings._id),invoiceHash:{$eq:invoiceIdentity(settings._id,number),$type:'string'}}).session(session);}
export async function historicalProductExists(productId){return SalesHistoryLedger.exists({storeId:await retentionStoreId(),$or:[{'facts.items.productId':productId},{'facts.items.freeProductId':productId},{'facts.items.ingredients.productId':productId}]});}
export async function purgedInvoiceExists(number){return SalesHistoryLedger.exists({storeId:await retentionStoreId(),invoiceHash:{$eq:invoiceIdentity(await retentionStoreId(),number),$type:'string'},purgedAt:{$ne:null}});}
export async function prepareRetentionRestore(payload,session){
  const storeId=await retentionStoreId();
  if(!await SalesHistoryLedger.exists({storeId}).session(session))return;
  const archivedSettings=payload.database.settings.find(row=>row.key==='global');
  if(String(archivedSettings?._id)!==storeId)throw Object.assign(new Error('Restore belongs to a different store'),{status:409});
  const purgedIds=new Set(),purgedInvoices=new Set();
  const archived=new Map(payload.database.sales.map(row=>[String(row._id),row]));
  for await(const row of SalesHistoryLedger.find({storeId}).session(session).lean().cursor({batchSize:100})){
    if(row.purgedAt){purgedIds.add(String(row._id));purgedInvoices.add(row.invoiceHash);continue;}
    const sale=archived.get(String(row._id));
    if(sale){if(saleSourceHash(sale)!==row.sourceHash)throw Object.assign(new Error('Restore would change permanent sales history'),{status:409});Object.assign(sale,{retentionProcessed:true,retentionStoreId:storeId,retentionHash:row.sourceHash,expiresAt:row.expiresAt});}
  }
  payload.database.sales=payload.database.sales.filter(row=>!purgedIds.has(String(row._id))&&!purgedInvoices.has(invoiceIdentity(storeId,row.invoiceNumber)));
  // Permanent collections are deliberately absent from the legacy replacement
  // list. Restored legacy bills must pass a fresh backfill/validation before purge.
  await SalesRetentionState.updateOne({storeId},{$set:{validatedAt:null,validationVersion:0,validationInProgress:false,validationCursor:null}},{session});
}
export async function rawRetentionSettings(){const settings=await Settings.findOne({key:'global'}).lean();if(!settings?._id)throw new Error('Persisted store settings are required');return settings;}
