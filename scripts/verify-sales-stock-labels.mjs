// This customer's configured authenticated DB connection, read-only operations.
import {registerHooks} from 'node:module';
import {existsSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/')){
    const base=path.resolve('src',specifier.slice(2));
    const target=[base+'.js',path.join(base,'index.js')].find(existsSync);
    if(target)return next(pathToFileURL(target).href,context);
  }
  return next(specifier,context);
}});
process.loadEnvFile('.env.local');mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
const requestedSku=process.argv.find(value=>value.startsWith('--stock-card-sku='))?.slice(17);
try{
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
  const {getSalesIndex}=await import('../src/services/sales-index.service.js');
  const {getProducts}=await import('../src/services/product.service.js');
  const report={measuredAt:new Date().toISOString(),databaseWrites:0,indexSamples:[],checked:0};
  let index;
  for(let run=0;run<5;run++){const start=performance.now();index=await getSalesIndex();report.indexSamples.push({ms:+(performance.now()-start).toFixed(2),rows:index.rows.length,bytes:Buffer.byteLength(JSON.stringify(index))});}
  assert.ok(index.complete);
  // Compare every card to the existing canonical product API in bounded pages.
  const start=performance.now();
  for(let offset=0;offset<index.rows.length;offset+=50){
    const selection=index.rows.slice(offset,offset+50);
    const details=await getProducts({_id:{$in:selection.map(r=>r._id)}},{salesOnly:true});
    const byId=new Map(details.map(p=>[String(p._id),p]));
    for(const row of selection){assert.equal(row.stockLabel,byId.get(row._id)?.stockLabel);report.checked++;}
  }
  report.parityMs=+(performance.now()-start).toFixed(2);
  const target=requestedSku?index.rows.find(row=>row.sku===requestedSku):undefined;
  report.requestedCard=target?{found:true,sku:target.sku,price:target.packageSellingPrice,stockLabel:target.stockLabel}:{found:false};
  report.allStockLabelsMatch=true;
  writeFileSync('docs/sales-stock-label-verification.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({error:error.name,code:error.code}));process.exitCode=1;}
finally{await mongoose.disconnect();}
