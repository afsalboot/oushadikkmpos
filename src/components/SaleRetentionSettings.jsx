"use client";
import {useCallback,useEffect,useState} from 'react';
import {resourceFetch} from '@/lib/resource-fetch';
import {toast} from 'sonner';
async function api(options){const response=await resourceFetch('/api/settings/sale-retention',options);const result=await response.json();if(!response.ok)throw new Error(result.error||'Retention request failed');return result.data;}
export default function SaleRetentionSettings({data,change,disabled}){
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmation,setConfirmation]=useState('');
  const admin=data._capabilities?.role==='ADMIN';
  const refresh=useCallback(async()=>{try{setPreview(await api());setError('');}catch(error){setError(error.message);}},[]);
  useEffect(()=>{if(admin){const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);}},[admin,refresh]);
  async function run(action){
    if(busy||!preview)return;setBusy(true);setError('');
    try{
      let afterId,first=true,result;
      do{result=await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,storeId:preview.storeId,afterId,restart:action==='VALIDATE'&&first,confirmation})});afterId=result.next;first=false;}while(action!=='CLEANUP'&&!result.complete);
      toast.success(action==='CLEANUP'?`${result.deleted||0} old bills deleted.`:action==='BACKFILL'?'Permanent sales history prepared.':'Sales history reconciled.');setConfirmation('');await refresh();
    }catch(error){setError(error.message);}finally{setBusy(false);}
  }
  if(!admin)return <div className="panel p-5">Only an administrator can manage sale retention.</div>;
  return <div className="panel space-y-4 p-5">
    <h3 className="font-extrabold">Sale bill retention</h3>
    <p className="text-sm text-[var(--muted)]">Detailed bills are kept for 90 days. Older bills are permanently deleted after summaries are prepared and verified. Historical totals remain available; deleted bills cannot be opened or reprinted.</p>
    <label className="flex items-center gap-3"><input type="checkbox" checked={data.dataRetention?.enabled!==false} disabled={disabled||busy} onChange={event=>change('dataRetention.enabled',event.target.checked)}/>Enable 90-day retention policy</label>
    <p className="text-sm">Save policy changes using Save Settings. Cleanup also requires server activation after validation.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview&&<div className="grid gap-2 text-sm"><p>Detailed bills: {preview.detailed} · Older than 60 days: {preview.olderThan60Days} · Older than 90 days: {preview.eligibleByAge}</p><p>Summaries: {preview.validated?'Validated':'Migration or validation required'} · Cleanup: {preview.cleanupEnabled&&preview.validated?'Enabled':'Locked or disabled'}</p><p>Last cleanup: {preview.lastRun?`${preview.lastRun.status} — ${preview.lastRun.deleted} deleted, ${preview.lastRun.skipped} skipped`:'Never run'}</p></div>}
    <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={()=>void refresh()}>Refresh preview</button><button className="btn" disabled={busy||!preview} onClick={()=>void run('BACKFILL')}>Prepare permanent summaries</button><button className="btn" disabled={busy||!preview} onClick={()=>void run('VALIDATE')}>Validate summaries</button></div>
    <label className="block text-sm">Type DELETE OLD BILLS to permanently delete one batch of eligible bills<input className="field mt-2" value={confirmation} disabled={busy} onChange={event=>setConfirmation(event.target.value)}/></label>
    <button className="btn btn-danger" disabled={busy||!preview?.validated||!preview?.cleanupEnabled||confirmation!=='DELETE OLD BILLS'} onClick={()=>void run('CLEANUP')}>{busy?'Working…':'Delete eligible old bills'}</button>
  </div>;
}
