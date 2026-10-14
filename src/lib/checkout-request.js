// Keep the same key after a network error so retrying cannot issue a second invoice.
import { resourceFetch } from './resource-fetch.js';
const storageKey='oushadi-pending-checkout';
function readPending() {
  try {return JSON.parse(sessionStorage.getItem(storageKey)||'null');} catch {return null;}
}
export function pendingCheckoutBody(intent) {
  const pending=readPending();
  if (!pending?.intent) return null; // Existing uncertain requests still use exact body matching.
  if (pending.intent!==intent) throw new Error('The previous checkout has an uncertain result. Retry it before changing the sale.');
  return pending.body;
}
export async function checkoutFetch(url,options) {
  if(url!=='/api/sales'||options?.method!=='POST')return resourceFetch(url,options);
  let pending=readPending();
  if(pending&&pending.body!==options.body)throw new Error('The previous checkout has an uncertain result. Retry it before changing the sale.');
  pending ||= {key:crypto.randomUUID(),body:options.body,intent:options.checkoutIntent};
  sessionStorage.setItem(storageKey,JSON.stringify(pending));
  const {checkoutIntent: _intent,...requestOptions}=options;
  const response=await resourceFetch(url,{...requestOptions,headers:{...options.headers,'Idempotency-Key':pending.key}});
  // Read a clone first: an interrupted response body is still an uncertain checkout.
  if(response.ok)await response.clone().json();
  if(response.ok||(response.status>=400&&response.status<500&&![408,429].includes(response.status)))sessionStorage.removeItem(storageKey);
  return response;
}
