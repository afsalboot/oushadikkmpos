import {timingSafeEqual} from 'node:crypto';
export function retentionCronAuthorized(header,secret){
  if(!secret||secret.length<32)return false;
  const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header||'');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
