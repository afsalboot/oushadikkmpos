// Authenticated read-only explain/index inspection; no document values in output.
import mongoose from 'mongoose';
import { writeFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {serverSelectionTimeoutMS:10000});
const report={measuredAt:new Date().toISOString(),databaseWrites:0,indexes:{},plans:[]};
function stages(plan,result=[]) {
  if (!plan || typeof plan!=='object') return result;
  if (plan.stage) result.push({stage:plan.stage,...(plan.indexName?{indexName:plan.indexName}:{})});
  for(const value of Object.values(plan))if(value&&typeof value==='object')stages(value,result);
  return result;
}
try {
  await client.connect();const db=client.db();
  for(const name of ['products','inventorybatches','sales','customers']) {
    report.indexes[name]=(await db.collection(name).indexes()).map(({name,key,unique,sparse,partialFilterExpression})=>({name,key,unique,sparse,partialFilterExpression}));
  }
  const filter={active:true,visibleInSales:{$ne:false}};
  const ids=(await db.collection('products').find(filter,{projection:{_id:1}}).sort({name:1}).limit(50).toArray()).map(r=>r._id);
  const retry=await db.collection('sales').findOne({requestKey:{$type:'string'}},{projection:{requestKey:1}});
  const settings=await db.collection('settings').findOne({key:'global'},{projection:{batchExpiry:1}});
  const checkoutFilter={productId:{$in:ids},$or:[{sealedPackages:{$gt:0}},{openQuantity:{$gt:0}}]};
  if(settings?.batchExpiry?.blockExpiredSales)checkoutFilter.$and=[{$or:[{expiryDate:{$exists:false}},{expiryDate:null},{expiryDate:{$gte:new Date(new Date().setHours(0,0,0,0))}}]}];
  const definitions=[
    ['lightweight-index',db.collection('products').find(filter).sort({name:1,_id:1}).limit(10001)],
    ['bounded-selling-page',db.collection('products').find(filter).sort({name:1}).limit(50)],
    ['bounded-selling-batches',db.collection('inventorybatches').find({productId:{$in:ids},$or:[{sealedPackages:{$gt:0}},{openQuantity:{$gt:0}}]}).sort({productId:1,expiryDate:1,createdAt:1})],
    ['checkout-valid-batches',db.collection('inventorybatches').find(checkoutFilter).sort({expiryDate:1,createdAt:1})],
    ...(retry?[
      ['checkout-retry-key-before',db.collection('sales').find({requestKey:retry.requestKey}).limit(1)],
      ['checkout-retry-key-typed',db.collection('sales').find({requestKey:{$eq:retry.requestKey,$type:'string'}}).limit(1)],
    ]:[]),
  ];
  for(const [name,query] of definitions){
    const samples=[];
    for(let run=0;run<5;run++){
      const started=performance.now(),plan=await query.clone().explain('executionStats'),s=plan.executionStats;
      samples.push({requestMs:+(performance.now()-started).toFixed(2),queryMs:s.executionTimeMillis,returned:s.nReturned,documentsExamined:s.totalDocsExamined,keysExamined:s.totalKeysExamined,stages:stages(plan.queryPlanner.winningPlan)});
    }
    report.plans.push({name,samples});
  }
  writeFileSync('docs/pos-performance-query-plans.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({error:error.name,code:error.code}));process.exitCode=1;}
finally{await client.close();}
