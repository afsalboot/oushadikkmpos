import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {writeFileSync,readFileSync} from 'node:fs';
import * as models from '../src/models/index.js';
import {createSaleRetentionService,initializeRetentionModels} from '../src/services/sale-retention.service.js';
import {historicalSalesAggregate,loadHistoricalSales,retentionStoreId,findHistoricalRetry,prepareRetentionRestore} from '../src/services/sale-history.service.js';
import {SETTINGS_DEFAULTS,invalidateSettingsCache} from '../src/services/settings.service.js';
import {getReport} from '../src/services/report.service.js';
import {getAccountData} from '../src/services/account-data.service.js';
import {dashboardSalesPipeline} from '../src/lib/dashboard-sales-pipeline.js';
import {reportOverviewPipeline} from '../src/lib/report-overview-pipeline.js';
import {businessDay,saleExpiry,saleSourceHash,saleAnalyticsFacts,dailyContribution,productContributions,invoiceIdentity,sumMetrics,RETENTION_VERSION} from '../src/lib/sale-retention.js';
import {canonical} from '../src/lib/fiscal-integrity.js';
import {queryValues} from '../src/lib/filter-utils.js';
import {escapeRegex,normalizePhone} from '../src/services/customer.service.js';
import {saleForActor} from '../src/lib/external-purchase.js';
import {createRequire} from 'node:module';

process.env.MONGOMS_DOWNLOAD_DIR=path.join(tmpdir(),'oushadi-retention-mongo-binaries');
const oid=()=>new mongoose.Types.ObjectId(),storeId=oid(),customerId=oid(),actorId=oid(),productId=oid(),now=new Date('2026-10-14T08:00:00Z');
let replica,service;const evidence={database:'isolated localhost MongoDB replica set',liveDatabaseWrites:0,checks:[]};
test.before(async()=>{
  replica=await MongoMemoryReplSet.create({binary:{version:'8.2.6'},replSet:{count:1,storageEngine:'wiredTiger'}});
  const uri=replica.getUri('pos_retention_fixture');assert.ok(/^mongodb:\/\/127\.0\.0\.1:/.test(uri));
  await mongoose.connect(uri,{autoIndex:false,autoCreate:false});
  await models.Sale.createCollection();await initializeRetentionModels();
  service=createSaleRetentionService({...models,transaction:work=>mongoose.connection.transaction(work,{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}})});
  evidence.mongoVersion=(await mongoose.connection.db.admin().command({buildInfo:1})).version;
});
test.after(async()=>{await mongoose.disconnect();await replica?.stop();if(process.env.RETENTION_TEST_REPORT)writeFileSync(process.env.RETENTION_TEST_REPORT,JSON.stringify(evidence,null,2)+'\n');});
function bill(days,extra={}){
  const date=new Date(+now-days*86400000);
  return {_id:oid(),invoiceNumber:'FIXTURE-'+oid(),createdAt:date,invoiceDate:date,updatedAt:date,documentType:'COMMERCIAL_INVOICE',documentStatus:'FINALIZED',customerType:'RETAIL',customerId,actorId,subtotal:100,total:100,amountPaid:100,balanceDue:0,paymentStatus:'PAID',customerSnapshot:{name:'Fixture',phone:'private'},cashierSnapshot:{name:'Fixture cashier'},items:[{productId,name:'Fixture oil',kind:'PRODUCT',saleMode:'PACKAGE',baseQuantity:100,baseUnit:'ml',quantity:1,unitPrice:100,total:100}],payments:[{method:'CASH',amount:100,paidAt:date}],...extra};
}
async function reset(rows=[]){
  assert.equal(mongoose.connection.db.databaseName,'pos_retention_fixture');
  for(const collection of await mongoose.connection.db.listCollections().toArray())await mongoose.connection.db.collection(collection.name).deleteMany({});
  await models.Settings.collection.insertOne({_id:storeId,...structuredClone(SETTINGS_DEFAULTS)});
  await models.Customer.collection.insertOne({_id:customerId,name:'Fixture',active:true,outstandingAmount:45});
  await models.User.collection.insertOne({_id:actorId,name:'Fixture cashier',role:'ADMIN',active:true});
  await models.Product.collection.insertOne({_id:productId,name:'Fixture oil',active:true,allowPackageSale:true,packageSize:100,baseUnit:'ml',packageType:'Bottle',packageSellingPrice:100});
  await models.InventoryBatch.collection.insertOne({_id:oid(),productId,batchNumber:'FIXTURE',status:'ACTIVE',packageSize:100,sealedPackages:5,openQuantity:20,purchasePrice:20,sellingPrice:100,expiryDate:new Date('2028-01-01')});
  await models.StockTransaction.collection.insertOne({_id:oid(),productId,note:'Fixture stock marker'});
  if(rows.length)await models.Sale.collection.insertMany(rows);invalidateSettingsCache();process.env.SALES_RETENTION_CLEANUP_ENABLED='1';
}
async function migrate(){let result,afterId;do{result=await service.rebuild({afterId,limit:2});afterId=result.next;}while(!result.complete);for(const row of await models.Sale.find().lean()){const ledger=await models.SalesHistoryLedger.findById(row._id).lean();assert.deepEqual(canonical(ledger.facts),canonical(saleAnalyticsFacts(row)));}do{result=await service.validate({limit:2});}while(!result.complete);return result;}
async function unchanged(){const result={};for(const name of ['inventorybatches','stocktransactions','customers','expenses'])result[name]=await mongoose.connection.db.collection(name).find({}).sort({_id:1}).toArray();return mongoose.mongo.BSON.EJSON.stringify(result);}
async function record(name,work){await work();evidence.checks.push({name,passed:true});}
function route(file){const source=readFileSync(new URL('../src/app/api/'+file+'/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export ','');const dependencies={...models,mongoose,connectDb:async()=>{},requireSession:async()=>({sub:String(actorId),role:'ADMIN'}),ok:(data,status=200)=>({data,status}),fail:(error,status=400)=>({error,status}),apiError:error=>({error:error.message,status:error.status||500}),queryValues,escapeRegex,normalizePhone,loadHistoricalSales,retentionStoreId,saleForActor};return new Function(...Object.keys(dependencies),source+';return {GET,DELETE:typeof DELETE===\'function\'?DELETE:null};')(...Object.values(dependencies));}
async function checkoutRoute(){
  const require=createRequire(import.meta.url),{transform,loadBindings}=require('next/dist/build/swc');await loadBindings();
  const source=readFileSync(new URL('../src/app/api/sales/route.js',import.meta.url),'utf8'),{code}=await transform(source,{filename:'sales-route.js',jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}}),fixtureModule={exports:{}};
  const response=(data,status=200)=>({data,status,headers:new Map()});
  const fixtureRequire=name=>name==='@/models'?models:name==='@/lib/db'?{connectDb:async()=>{}}:name==='@/lib/auth'?{requireSession:async()=>({sub:String(actorId),role:'ADMIN',name:'Fixture cashier'})}:name==='@/lib/api'?{ok:response,fail:(error,status=400)=>({...response(null,status),error}),apiError:error=>({...response(null,error.status||500),error:error.message})}:require(name.startsWith('@/')?'../src/'+name.slice(2)+'.js':name);
  new Function('require','module','exports',code)(fixtureRequire,fixtureModule,fixtureModule.exports);return fixtureModule.exports;
}
test('real MongoDB retention transactions and historical reporting',async t=>{
  await t.test('locked activation and strict date boundaries; permanent summaries and side effects',()=>record('90-day boundary, gates, summaries, stock/customer preservation',async()=>{
    const rows=[bill(91),bill(90),bill(89),bill(-1)];await reset(rows);
    await assert.rejects(()=>service.cleanup({now}),/locked/);delete process.env.SALES_RETENTION_CLEANUP_ENABLED;assert.equal((await service.cleanup({now})).deleted,0);process.env.SALES_RETENTION_CLEANUP_ENABLED='1';
    await migrate();const before=await unchanged();await models.AuditLog.collection.insertOne({targetType:'Sale',targetId:rows[0]._id,action:'SALE_EDITED',metadata:{before:rows[0],after:rows[0],requestKey:'edit-key'}});
    const result=await service.cleanup({now});assert.equal(result.deleted,1);assert.equal(await models.Sale.countDocuments({}),3);assert.equal(await unchanged(),before);
    assert.equal((await models.SalesHistoryLedger.findById(rows[0]._id).lean()).purgedAt.toISOString(),now.toISOString());
    const audit=await models.AuditLog.findOne({action:'SALE_EDITED'}).lean();assert.equal(audit.metadata.before,undefined);assert.equal(audit.metadata.after,undefined);assert.equal(audit.metadata.retentionPurged,true);
    const summary=await models.DailySalesSummary.findOne({storeId:String(storeId),date:businessDay(rows[0])}).lean();assert.equal(summary.metrics.netSalesCents,10000);
  }));
  await t.test('before/after all financial report KPIs, accounts, GST, product quantities and dashboard profit',()=>record('before/after reports, account running balances and estimated dashboard cost',async()=>{
    const rows=[bill(101),bill(100,{total:250,subtotal:250,amountPaid:50,balanceDue:200,paymentStatus:'PARTIAL',saleType:'WHOLESALE',items:[{productId,name:'Fixture oil',kind:'PRODUCT',saleMode:'WHOLESALE',quantity:2,paidQuantity:2,freeQuantity:1,totalOutgoingQuantity:3,baseQuantity:200,baseUnit:'ml',total:250}],payments:[{method:'CASH',amount:30,paidAt:new Date(+now-100*86400000)},{method:'UPI',amount:20,paidAt:new Date(+now-100*86400000)}]}),bill(99,{gstEnabled:true,tax:5,cgst:2.5,sgst:2.5,registrationSnapshot:{status:'REGULAR'},items:[{productId,name:'Oil',kind:'PRODUCT',saleMode:'LOOSE',quantity:10,baseQuantity:10,baseUnit:'ml',looseUnit:'ml',total:100,taxableValue:95,totalTax:5,cgst:2.5,sgst:2.5,gstRate:5,hsnCode:'1234',uqc:'MLT'}]})];
    await reset(rows);const reportTypes=['sales','wholesale-sales','product-sales','loose-sales','payment-methods','customers','staff','gst-register','hsn-summary','gross-profit','custom-mix','mix-ingredients','overview','cash-flow'];
    const read=async()=>Object.fromEntries(await Promise.all(reportTypes.map(async type=>[type,(await getReport(type,new URLSearchParams())).kpis])));
    const before=await read(),accountBefore=await getAccountData({inferPaymentMethods:true});
    const dates={start:new Date('2026-01-01'),end:now,previousStart:new Date('2025-01-01')},windows=[{start:dates.start,end:now,previousStart:dates.previousStart,previousEnd:dates.start}],pipeline=dashboardSalesPipeline(dates,windows,[{_id:productId,packageSize:100}],new Map([[String(productId),0.2]]));
    const [dashboardBefore]=await historicalSalesAggregate(pipeline),[overviewBefore]=await historicalSalesAggregate(reportOverviewPipeline({}));
    await migrate();assert.deepEqual(await read(),before);await service.cleanup({now});assert.deepEqual(await read(),before);
    const accountAfter=await getAccountData({inferPaymentMethods:true});assert.deepEqual(accountAfter.summary,accountBefore.summary);assert.deepEqual(accountAfter.cashFlow,accountBefore.cashFlow);assert.deepEqual(accountAfter.movements.map(row=>row.runningBalance),accountBefore.movements.map(row=>row.runningBalance));assert.ok(accountAfter.movements.every(row=>row.sourcePath===null));
    const [dashboardAfter]=await historicalSalesAggregate(pipeline),[overviewAfter]=await historicalSalesAggregate(reportOverviewPipeline({}));assert.deepEqual(dashboardAfter.summary,dashboardBefore.summary);assert.deepEqual(dashboardAfter.chart,dashboardBefore.chart);assert.deepEqual(overviewAfter,overviewBefore);
  }));
  await t.test('repeated backfill is idempotent, edits replace contributions, checkpointed validation resumes',()=>record('idempotent backfill, edited contributions, validation checkpoints',async()=>{
    const sale=bill(91);await reset([sale]);await service.rebuild();const initial=await models.DailySalesSummary.findOne().lean();await service.rebuild();assert.deepEqual((await models.DailySalesSummary.findOne().lean()).metrics,initial.metrics);
    const revised={...sale,total:120,subtotal:120,updatedAt:new Date(),payments:[{method:'CASH',amount:120}],items:[{...sale.items[0],total:120}]};await models.Sale.collection.replaceOne({_id:sale._id},revised);
    await service.rebuild();assert.equal((await models.DailySalesSummary.findOne().lean()).metrics.netSalesCents,12000);
    assert.equal((await service.validate({limit:1})).complete,false);assert.equal((await service.validate({limit:1})).complete,true);assert.equal((await service.cleanup({now})).deleted,1);assert.equal((await service.cleanup({now})).deleted,0);
  }));
  await t.test('incomplete/corrupt summaries and edited candidates block all deletion',()=>record('missing contributions and corrupt summaries fail closed',async()=>{
    const sale=bill(91);await reset([sale]);await assert.rejects(()=>service.validate(),/incomplete/);await migrate();
    await models.DailySalesSummary.updateOne({},{$inc:{'metrics.netSalesCents':1}});await assert.rejects(()=>service.cleanup({now}),/reconcile/);assert.equal(await models.Sale.countDocuments(),1);
    await models.DailySalesSummary.updateOne({},{$inc:{'metrics.netSalesCents':-1}});await models.Sale.collection.updateOne({_id:sale._id},{$set:{total:101}});await assert.rejects(()=>service.cleanup({now}),/Candidate/);assert.equal(await models.Sale.countDocuments(),1);
  }));
  await t.test('failed ledger mutation rolls back the actual delete, audit trimming and cost snapshot',()=>record('real database transaction rollback after delete',async()=>{
    const sale=bill(91);await reset([sale]);await migrate();const original=models.SalesHistoryLedger.updateMany;
    models.SalesHistoryLedger.updateMany=()=>{throw new Error('Fixture failure after delete');};
    try{await assert.rejects(()=>service.cleanup({now}),/Fixture failure/);}finally{models.SalesHistoryLedger.updateMany=original;}
    assert.equal(await models.Sale.countDocuments(),1);const ledger=await models.SalesHistoryLedger.findById(sale._id).lean();assert.equal(ledger.purgedAt,undefined);assert.equal(ledger.dashboardCost,undefined);assert.equal((await models.SalesRetentionRun.findOne().lean()).status,'FAILED');
  }));
  await t.test('simultaneous cleanup jobs delete once, bounded batches resume and old retry never duplicates',()=>record('concurrent cleanup, bounded batches and purged retry',async()=>{
    const rows=Array.from({length:5},()=>bill(91));rows[0].requestKey='fixture-retry-key-001';rows[0].requestHash='fixture-hash';await reset(rows);await migrate();
    const results=await Promise.all([service.cleanup({now,limit:2}),service.cleanup({now,limit:2})]);assert.equal(results.reduce((sum,row)=>sum+row.deleted,0),4);assert.equal((await service.cleanup({now,limit:2})).deleted,1);assert.equal(await models.SalesHistoryLedger.countDocuments(),5);
    await assert.rejects(()=>findHistoricalRetry(rows[0].requestKey,'fixture-hash',actorId),error=>error.status===410);await assert.rejects(()=>findHistoricalRetry(rows[0].requestKey,'changed',actorId),error=>error.status===409);
  }));
  await t.test('legacy restore keeps permanent history and filters purged bills instead of resurrecting them',()=>record('legacy restore protection and preserved analytics collections',async()=>{
    const old=bill(91),recent=bill(1);await reset([old,recent]);await migrate();await service.cleanup({now});
    const payload={database:{settings:[{_id:storeId,key:'global'}],sales:[old,recent]}};
    await mongoose.connection.transaction(session=>prepareRetentionRestore(payload,session));assert.equal(payload.database.sales.length,1);assert.equal(String(payload.database.sales[0]._id),String(recent._id));assert.equal(await models.SalesHistoryLedger.countDocuments(),2);
    assert.equal((await models.SalesRetentionState.findOne().lean()).validatedAt,null);
  }));
  await t.test('tampered analytic facts fail source verification and explicit backfill repairs summaries',()=>record('direct source/facts verification and deterministic repair',async()=>{
    const sale=bill(91);await reset([sale]);await migrate();
    await models.SalesHistoryLedger.updateOne({_id:sale._id},{$set:{'facts.total':999}});
    await assert.rejects(()=>service.validate({restart:true}),/do not reconcile/);await assert.rejects(()=>service.cleanup({now}),/Candidate/);assert.equal(await models.Sale.countDocuments(),1);
    await models.DailySalesSummary.deleteMany({});await service.rebuild();await service.validate({restart:true});assert.equal((await models.DailySalesSummary.findOne().lean()).metrics.netSalesCents,10000);assert.equal((await service.cleanup({now})).deleted,1);
  }));
  await t.test('forged processed flags cannot hide missing ledger rows from migration validation',()=>record('full source coverage validation',async()=>{
    const sale=bill(91);await reset([sale]);await service.rebuild();await models.SalesHistoryLedger.deleteMany({});await assert.rejects(()=>service.validate({restart:true}),/missing its permanent history/);assert.equal(await models.Sale.countDocuments(),1);
  }));
  await t.test('customer directory and details retain all lifetime statistics, with only retained bills retrievable',()=>record('actual customer API lifetime statistics and deactivation',async()=>{
    await reset([bill(91),bill(92,{total:150}),bill(1)]);const list=route('customers'),details=route('customers/[id]'),params={params:Promise.resolve({id:String(customerId)})},request={url:'http://fixture/api/customers'};
    const beforeList=await list.GET(request),beforeDetail=await details.GET(null,params);assert.equal(beforeList.status,200,beforeList.error);assert.equal(beforeDetail.status,200,beforeDetail.error);
    await migrate();await service.cleanup({now});const afterList=await list.GET(request),afterDetail=await details.GET(null,params);
    for(const key of ['purchaseCount','totalSpent','averageBill','highestBill','firstPurchaseAt','lastPurchaseAt'])assert.deepEqual(afterList.data.rows[0][key],beforeList.data.rows[0][key],key);
    assert.deepEqual(afterList.data.kpis,beforeList.data.kpis);assert.deepEqual(afterDetail.data.stats,beforeDetail.data.stats);assert.deepEqual(afterDetail.data.frequentProducts,beforeDetail.data.frequentProducts);assert.equal(afterDetail.data.bills.length,1);
    await service.cleanup({now:new Date(+now+100*86400000)});const result=await details.DELETE(null,params);assert.equal(result.data.archived,true);assert.equal(await models.Customer.countDocuments(),1);
  }));
  await t.test('cancelled, mix, external, credit and legacy overpayment calculations remain unchanged',()=>record('cancelled/mix/external/credit/legacy payments and report rows',async()=>{
    const rows=[bill(91,{documentStatus:'CANCELLED'}),bill(92,{items:[{name:'Fixture mix',kind:'MIX',saleMode:'MIX',quantity:1,baseQuantity:50,baseUnit:'ml',total:100,ingredients:[{name:'Oil ingredient',productId,baseQuantity:50,baseUnit:'ml',total:100}]}]}),bill(93,{items:[{name:'External product',itemSource:'external_purchase',kind:'PRODUCT',saleMode:'PACKAGE',quantity:1,total:100,purchaseCost:60,externalPurchasePaymentMethod:'CASH'}]}),bill(94,{total:100.01,payments:[{method:'CASH',amount:120,paidAt:new Date(+now-94*86400000)},{method:'UPI',amount:0}],balanceDue:0.01}),bill(95,{saleType:'WHOLESALE',payments:[],balanceDue:100,amountPaid:0,paymentStatus:'UNPAID'})];
    rows.push(bill(96,{items:[{name:'Legacy mix',kind:'PRODUCT',saleMode:'MIX',quantity:1,baseQuantity:20,baseUnit:'ml',total:100,ingredients:[{name:'Oil ingredient',productId,baseQuantity:20,baseUnit:'ml',total:100}]}]}));
    await reset(rows);await models.Expense.collection.insertOne({_id:oid(),source:'EXTERNAL_PURCHASE',referenceId:rows[2]._id,category:'External purchase',amount:60,paidAmount:60,paymentMethod:'CASH',createdAt:rows[2].createdAt});
    const types=['product-sales','loose-sales','mix-ingredients','payment-methods','hsn-summary','customers','staff','expenses','inventory','inventory-valuation','stock-movement'];const read=async()=>Object.fromEntries(await Promise.all(types.map(async type=>{const value=await getReport(type,new URLSearchParams());return [type,{kpis:value.kpis,rows:value.rows}];})));
    const before=await read(),accountsBefore=(await getAccountData()).summary;await migrate();await service.cleanup({now});assert.deepEqual(await read(),before);assert.deepEqual((await getAccountData()).summary,accountsBefore);
  }));
  await t.test('cross-store records never enter reports and wrong-store contributions prevent migration',()=>record('persisted store scope isolation',async()=>{
    const local=bill(91),foreign=bill(91,{retentionStoreId:'foreign-store',total:999});await reset([local,foreign]);await service.rebuild();const [total]=await historicalSalesAggregate([{$group:{_id:null,total:{$sum:'$total'}}}]);assert.equal(total.total,100);await assert.rejects(()=>service.validate(),/incomplete/);assert.equal(await models.Sale.countDocuments(),2);
  }));
  await t.test('product merge remaps permanent analytical product totals without changing money or stock',()=>record('purged product merge analytics',async()=>{
    const sale=bill(91);await reset([sale]);await migrate();await service.cleanup({now});const settings=await models.Settings.findOne().lean(),targetId=oid(),before=await unchanged(),summary=await models.DailySalesSummary.findOne().lean();
    await mongoose.connection.transaction(session=>service.remapProducts({sourceIds:[productId],targetId,settings,session}));await service.validate({restart:true});const ledger=await models.SalesHistoryLedger.findById(sale._id).lean();assert.equal(String(ledger.facts.items[0].productId),String(targetId));assert.deepEqual((await models.DailySalesSummary.findOne().lean()).metrics,summary.metrics);assert.equal(await unchanged(),before);
  }));
  await t.test('actual checkout commits history once, customer/stock changes roll back when history fails',()=>record('actual checkout transaction, duplicate clicks, retry and rollback',async()=>{
    await reset();const checkout=await checkoutRoute();const input={items:[{productId:String(productId),kind:'PRODUCT',saleMode:'PACKAGE',quantity:1}],customerType:'WALK_IN',payments:[{method:'CASH',amount:100}]},request=key=>({json:async()=>input,headers:{get:()=>key}});
    const key='retention-checkout-fixture-001',results=await Promise.all([checkout.POST(request(key)),checkout.POST(request(key))]);assert.ok(results.every(result=>result.status===201||result.status===200),JSON.stringify(results.map(row=>row.error)));assert.equal(await models.Sale.countDocuments(),1);assert.equal(await models.SalesHistoryLedger.countDocuments(),1);assert.equal((await models.DailySalesSummary.findOne().lean()).metrics.salesCount,1);assert.equal((await models.InventoryBatch.findOne().lean()).sealedPackages,4);
    const original=models.SalesHistoryLedger.updateOne;models.SalesHistoryLedger.updateOne=()=>{throw new Error('Fixture history failure');};try{const failed=await checkout.POST(request('retention-checkout-fixture-002'));assert.equal(failed.status,422);}finally{models.SalesHistoryLedger.updateOne=original;}
    assert.equal(await models.Sale.countDocuments(),1);assert.equal((await models.InventoryBatch.findOne().lean()).sealedPackages,4);assert.equal((await models.DailySalesSummary.findOne().lean()).metrics.salesCount,1);
    await service.validate();await service.cleanup({now:new Date(Date.now()+91*86400000)});const retry=await checkout.POST(request(key));assert.equal(retry.status,410,retry.error);assert.equal(await models.Sale.countDocuments(),0);assert.equal((await models.InventoryBatch.findOne().lean()).sealedPackages,4);
  }));
  await t.test('100000 old fixture bills are processed with bounded detail reads and indexed expiry candidates',()=>record('100000-bill isolated fixture, bounded cleanup, indexed plan',async()=>{
    await reset();const days=new Map();let source=[],ledgers=[];const started=performance.now();
    for(let index=0;index<100000;index++){
      const date=new Date(+now-(91+index%365)*86400000),sale={_id:oid(),invoiceNumber:'BATCH-'+index,createdAt:date,invoiceDate:date,updatedAt:date,documentStatus:'FINALIZED',total:1,subtotal:1,items:[],payments:[{method:'CASH',amount:1,paidAt:date}]};
      const facts=saleAnalyticsFacts(sale),metrics=dailyContribution(facts),hash=saleSourceHash(sale),day=businessDay(sale),expiry=saleExpiry(sale);
      Object.assign(sale,{retentionStoreId:String(storeId),retentionProcessed:true,retentionHash:hash,expiresAt:expiry});source.push(sale);ledgers.push({_id:sale._id,storeId:String(storeId),date:day,saleDate:date,sourceHash:hash,version:RETENTION_VERSION,facts,metrics,productMetrics:productContributions(facts),invoiceHash:invoiceIdentity(storeId,sale.invoiceNumber),expiresAt:expiry});days.set(day,sumMetrics([days.get(day)||{},metrics]));
      if(source.length===1000){await models.Sale.collection.insertMany(source);await models.SalesHistoryLedger.collection.insertMany(ledgers);source=[];ledgers=[];}
    }
    await models.DailySalesSummary.insertMany([...days].map(([date,metrics])=>({storeId:String(storeId),date,metrics,version:RETENTION_VERSION})));await models.SalesRetentionState.create({storeId:String(storeId),validatedAt:new Date(),validationVersion:RETENTION_VERSION});
    const plan=await models.Sale.find({retentionStoreId:String(storeId),retentionProcessed:true,expiresAt:{$lt:now}}).sort({expiresAt:1,_id:1}).limit(100).explain('executionStats');assert.ok(JSON.stringify(plan.queryPlanner.winningPlan).includes('sale_retention_candidates'));assert.ok(plan.executionStats.totalDocsExamined<=100);
    const result=await service.cleanup({now,limit:100});assert.equal(result.deleted,100);assert.equal(await models.Sale.countDocuments(),99900);const [total]=await historicalSalesAggregate([{$group:{_id:null,total:{$sum:'$total'},count:{$sum:1}}}]);assert.equal(total.total,100000);assert.equal(total.count,100000);
    evidence.largeFixture={count:100000,batchSize:100,deleted:result.deleted,totalDocsExamined:plan.executionStats.totalDocsExamined,index:'sale_retention_candidates',elapsedMs:Math.round(performance.now()-started)};
  }));
});
