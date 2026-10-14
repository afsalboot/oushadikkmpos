import { createHash } from 'node:crypto';
const hash = (hosts, database) => createHash('sha256').update(`${hosts.join(',')}|${database}`).digest('hex');
export const databaseIdentity = (hosts, database) => hash(hosts.map(String).sort(), database);
export function matchesLegacyIdentity(value, hosts, database) {
  // Initial reports used driver discovery order. SRV node order can vary.
  // Verify that original identifier against the same host set, without changing
  // any before fingerprint or assuming that a matching store means the same DB.
  const candidates=hosts.map(String);
  if(candidates.length>6) return false;
  const visit=(prefix,remaining)=>!remaining.length?hash(prefix,database)===value:
    remaining.some((host,index)=>visit([...prefix,host],remaining.filter((_,i)=>i!==index)));
  return visit([],candidates);
}
