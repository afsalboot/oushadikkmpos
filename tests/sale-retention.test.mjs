import test from 'node:test';
import assert from 'node:assert/strict';
import {Sale,SalesHistoryLedger,DailySalesSummary} from '../src/models/index.js';
import {SETTINGS_DEFAULTS,validateSettings} from '../src/services/settings.service.js';
import {saleExpiry,businessDay,saleSourceHash,saleAnalyticsFacts,dailyContribution,retentionEligible,invoiceIdentity} from '../src/lib/sale-retention.js';
import {retentionCronAuthorized} from '../src/lib/retention-cron.js';
import {readFileSync} from 'node:fs';
const now=new Date('2026-10-14T08:00:00Z');
const bill=days=>({_id:'sale',invoiceDate:new Date(+now-days*86400000),createdAt:new Date(+now),total:100,subtotal:100,items:[],payments:[{method:'CASH',amount:120}],retentionProcessed:true,retentionStoreId:'store'});
function pair(days){const sale=bill(days);sale.expiresAt=saleExpiry(sale);sale.retentionHash=saleSourceHash(sale);const facts=saleAnalyticsFacts(sale);return [sale,{storeId:'store',version:1,sourceHash:sale.retentionHash,date:businessDay(sale),saleDate:sale.invoiceDate,expiresAt:sale.expiresAt,facts,metrics:dailyContribution(facts),productMetrics:[]}];}
test('strict 90-day boundary excludes exactly 90 days, recent and future business dates',()=>{
  for(const days of [89,90,-1])assert.equal(retentionEligible(...pair(days),now),false);
  assert.equal(retentionEligible(...pair(91),now),true);
  const [sale,ledger]=pair(90);assert.equal(retentionEligible(sale,ledger,new Date(+now+1)),true);
});
test('India business days and backend invoice date determine expiry regardless of creation date',()=>{
  assert.equal(businessDay({invoiceDate:'2026-07-15T18:30:00Z',createdAt:now}),'2026-07-16');
  assert.equal(+saleExpiry({createdAt:'2026-07-15T18:30:00Z'}),+new Date('2026-10-13T18:30:00Z'));
  assert.throws(()=>saleExpiry({invoiceDate:'invalid',createdAt:now}),/invalid/);
});
test('changed bills, missing contributions, forged expiry and cross-store facts fail closed',()=>{
  const [sale,ledger]=pair(91);assert.equal(retentionEligible(sale,null,now),false);
  assert.equal(retentionEligible(sale,{...ledger,storeId:'another'},now),false);
  assert.equal(retentionEligible({...sale,total:101},ledger,now),false);
  assert.equal(retentionEligible({...sale,expiresAt:new Date(0)},ledger,now),false);
  assert.equal(retentionEligible({...sale,retentionProcessed:false},ledger,now),false);
});
test('analytic whitelist omits invoice retrieval, customer PII, receipts, allocations and selling prices',()=>{
  const sale={...bill(91),invoiceNumber:'SECRET-INVOICE',customerSnapshot:{name:'SECRET-NAME',phone:'SECRET-PHONE',gstin:'SECRET-GSTIN'},receiptSnapshot:{footer:'SECRET-RECEIPT'},stockAllocations:[{batchId:'SECRET-BATCH'}],items:[{name:'Oil',quantity:1,unitPrice:100,total:100}],payments:[{method:'CASH',amount:120,reference:'SECRET-REFERENCE'}]};
  const facts=saleAnalyticsFacts(sale),json=JSON.stringify(facts);assert.equal(dailyContribution(facts).payment_CASH_Cents,10000);assert.equal(facts.customerIsB2B,true);assert.equal(json.includes('SECRET'),false);assert.equal(facts.items[0].unitPrice,undefined);
});
test('source fingerprint ignores only retention fields and invoice identity is store scoped',()=>{
  const sale=bill(91);assert.equal(saleSourceHash(sale),saleSourceHash({...sale,expiresAt:now,retentionHash:'hash',retentionStoreId:'different',retentionProcessed:false}));
  assert.notEqual(saleSourceHash(sale),saleSourceHash({...sale,total:99}));assert.notEqual(invoiceIdentity('one','INV-1'),invoiceIdentity('two','INV-1'));
});
test('daily money metrics reconcile capped split payments and credit without inventing COGS or refunds',()=>{
  const facts=saleAnalyticsFacts({...bill(91),total:100.1,subtotal:105.1,discount:5,tax:2,balanceDue:30.1,items:[{itemSource:'inventory',total:100.1}],payments:[{method:'CASH',amount:50},{method:'UPI',amount:20}]});
  const metrics=dailyContribution(facts);assert.equal(metrics.netSalesCents,10010);assert.equal(metrics.payment_CASH_Cents,5000);assert.equal(metrics.payment_UPI_Cents,2000);assert.equal(metrics.outstandingCents,3010);assert.equal(metrics.knownCostCents,0);assert.equal(metrics.unknownCostSales,1);assert.equal(metrics.refundCents,0);
});
test('retention uses ordinary indexes, permanent summaries have no TTL, and policy is fixed at 90 days',()=>{
  for(const model of [Sale,SalesHistoryLedger,DailySalesSummary])assert.ok(model.schema.indexes().every(([,options])=>options.expireAfterSeconds===undefined));
  assert.ok(Sale.schema.indexes().some(([keys])=>keys.retentionStoreId&&keys.expiresAt));
  assert.ok(validateSettings({...structuredClone(SETTINGS_DEFAULTS),dataRetention:{enabled:true,saleRetentionDays:60}})['dataRetention.saleRetentionDays']);
});
test('scheduler rejects absent, short, incorrect and malformed secrets',()=>{
  const secret='fixture-secret-'.repeat(3);assert.equal(retentionCronAuthorized('Bearer '+secret,secret),true);
  for(const [header,key]of [[null,secret],['Bearer wrong',secret],['Bearer short','short'],['Bearer '+secret,undefined]])assert.equal(retentionCronAuthorized(header,key),false);
});
test('admin endpoint rejects staff, stale stores and unconfirmed cleanup before mutation',async()=>{
  const source=readFileSync(new URL('../src/app/api/settings/sale-retention/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export ','');
  let admin=false,mutations=0;
  const dependencies={connectDb:async()=>{},requireSession:async permission=>{assert.equal(permission,'ADMIN');if(!admin)throw Object.assign(new Error('Forbidden'),{status:403});},ok:data=>({data,status:200}),fail:(error,status)=>({error,status}),apiError:error=>({error:error.message,status:error.status||500}),previewSaleRetention:async()=>({storeId:'fixture-store'}),initializeRetentionModels:async()=>{mutations++;},cleanupSaleHistory:async()=>{mutations++;return {deleted:0};},rebuildSaleHistory:async()=>{mutations++;},validateSaleHistory:async()=>{mutations++;}};
  const route=new Function(...Object.keys(dependencies),source+';return {GET,POST};')(...Object.values(dependencies)),request=body=>({json:async()=>body});
  assert.equal((await route.GET()).status,403);assert.equal((await route.POST(request({}))).status,403);admin=true;
  assert.equal((await route.POST(request({storeId:'other-store',action:'CLEANUP',confirmation:'DELETE OLD BILLS'}))).status,409);
  assert.equal((await route.POST(request({storeId:'fixture-store',action:'CLEANUP'}))).status,422);assert.equal(mutations,0);
});
test('disabled scheduler and benchmark mode never initialize models or touch the database',async()=>{
  const source=readFileSync(new URL('../src/app/api/cron/sale-retention/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export ','');
  let calls=0;const unexpected=async()=>{calls++;throw new Error('Unexpected database access');},dependencies={connectDb:unexpected,initializeRetentionModels:unexpected,cleanupSaleHistory:unexpected,retentionCronAuthorized:()=>true,ok:data=>({data,status:200}),fail:(error,status)=>({error,status}),apiError:error=>({error:error.message,status:500})};
  const route=new Function(...Object.keys(dependencies),source+';return {GET};')(...Object.values(dependencies)),oldGate=process.env.SALES_RETENTION_CLEANUP_ENABLED,oldBenchmark=process.env.POS_BENCHMARK_READ_ONLY;
  try{process.env.SALES_RETENTION_CLEANUP_ENABLED='0';delete process.env.POS_BENCHMARK_READ_ONLY;assert.equal((await route.GET({headers:{get:()=>''}})).data.status,'DISABLED');process.env.POS_BENCHMARK_READ_ONLY='1';assert.equal((await route.GET({headers:{get:()=>''}})).status,403);assert.equal(calls,0);}finally{if(oldGate===undefined)delete process.env.SALES_RETENTION_CLEANUP_ENABLED;else process.env.SALES_RETENTION_CLEANUP_ENABLED=oldGate;if(oldBenchmark===undefined)delete process.env.POS_BENCHMARK_READ_ONLY;else process.env.POS_BENCHMARK_READ_ONLY=oldBenchmark;}
});
