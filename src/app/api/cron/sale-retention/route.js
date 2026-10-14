import {connectDb} from '@/lib/db';
import {ok,fail,apiError} from '@/lib/api';
import {retentionCronAuthorized} from '@/lib/retention-cron';
import {initializeRetentionModels,cleanupSaleHistory} from '@/services/sale-retention.service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request){
  if(!retentionCronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return fail('Unauthorized scheduler',401);
  if(process.env.POS_BENCHMARK_READ_ONLY==='1')return fail('Writes are blocked in this read-only benchmark',403);
  if(process.env.SALES_RETENTION_CLEANUP_ENABLED!=='1')return ok({status:'DISABLED',deleted:0});
  try{
    await connectDb();await initializeRetentionModels();
    const started=Date.now(),result={status:'COMPLETED',deleted:0,batches:0,more:false};
    do{const batch=await cleanupSaleHistory({limit:100});result.status=batch.status;result.deleted+=batch.deleted;result.batches++;result.more=batch.found===100;if(!result.more||batch.status==='DISABLED')break;}while(result.batches<10&&Date.now()-started<30000);
    return ok(result);
  }catch(error){return apiError(error);}
}
