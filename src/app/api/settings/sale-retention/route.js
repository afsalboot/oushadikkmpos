import {connectDb} from '@/lib/db';
import {requireSession} from '@/lib/auth';
import {ok,fail,apiError} from '@/lib/api';
import {initializeRetentionModels,previewSaleRetention,rebuildSaleHistory,validateSaleHistory,cleanupSaleHistory} from '@/services/sale-retention.service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){try{await requireSession('ADMIN');await connectDb();return ok(await previewSaleRetention());}catch(error){return apiError(error);}}
export async function POST(request){
  try{
    await requireSession('ADMIN');
    if(process.env.POS_BENCHMARK_READ_ONLY==='1')return fail('Writes are blocked in this read-only benchmark',403);
    await connectDb();const body=await request.json(),preview=await previewSaleRetention();
    if(body.storeId!==preview.storeId)return fail('Store identity changed; refresh this page',409);
    if(!['BACKFILL','VALIDATE','CLEANUP'].includes(body.action))return fail('Unknown retention action',422);
    if(body.action==='CLEANUP'&&body.confirmation!=='DELETE OLD BILLS')return fail('Type DELETE OLD BILLS to confirm permanent deletion',422);
    await initializeRetentionModels();
    return ok(body.action==='BACKFILL'?await rebuildSaleHistory({afterId:body.afterId,limit:100}):body.action==='VALIDATE'?await validateSaleHistory({restart:body.restart===true,limit:100}):await cleanupSaleHistory({limit:100}));
  }catch(error){return apiError(error);}
}
