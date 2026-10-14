// Defaults to a read-only preview. Write operations require explicit store-bound
// confirmation and never activate cleanup or alter environment configuration.
import mongoose from 'mongoose';
process.loadEnvFile('.env.local');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
const action=args['--action']||'preview';
if(!['preview','backfill','validate','cleanup'].includes(action))throw new Error('Use preview, backfill, validate or cleanup');
const write=action!=='preview';
if(write&&process.env.POS_BENCHMARK_READ_ONLY==='1')throw new Error('Writes are blocked in benchmark mode');
mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
const {initializeRetentionModels,previewSaleRetention,rebuildSaleHistory,validateSaleHistory,cleanupSaleHistory}=await import('../src/services/sale-retention.service.js');
try{
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
  const preview=await previewSaleRetention();
  if(write&&(args['--store']!==preview.storeId||args['--confirm']!==(action==='cleanup'?'DELETE_OLD_BILLS':'PREPARE_HISTORY')))throw new Error('Explicit --store=<preview storeId> and --confirm=PREPARE_HISTORY (or DELETE_OLD_BILLS for cleanup) required');
  if(action==='preview')console.log(JSON.stringify(preview,null,2));
  else{
    await initializeRetentionModels();
    if(action==='cleanup')console.log(JSON.stringify(await cleanupSaleHistory({limit:100}),null,2));
    else{let result,afterId=args['--after'],first=true;do{result=action==='backfill'?await rebuildSaleHistory({afterId,limit:100}):await validateSaleHistory({restart:args['--restart']==='true'&&first,limit:100});console.log(JSON.stringify(result));afterId=result.next;first=false;}while(!result.complete);}
  }
}finally{await mongoose.disconnect();}
