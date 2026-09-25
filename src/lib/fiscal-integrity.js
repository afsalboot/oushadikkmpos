import {createHash} from 'node:crypto';

export function canonical(value) {
  if(value===null||typeof value!=='object')return value;
  if(typeof value.toJSON==='function')return canonical(value.toJSON());
  if(Array.isArray(value))return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
}
export const requestHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function assertRestorePreservesDocuments(current,archived,label='invoices') {
  const byId=new Map(archived.map(row=>[String(row._id),requestHash(row)]));
  for(const row of current)if(byId.get(String(row._id))!==requestHash(row))throw new Error(`Restore would remove or change issued ${label}. Reconcile the archive before restoring; original records must be preserved.`);
}
export function assertRetryMatches(sale,hash,actorId) {
  if(String(sale.actorId)!==String(actorId)||sale.requestHash!==hash)throw Object.assign(new Error('This checkout key has already been used for a different request'),{status:409});
  return sale;
}
