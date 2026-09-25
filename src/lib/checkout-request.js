// Keep the same key after a network error so retrying cannot issue a second invoice.
export async function checkoutFetch(url,options) {
  if(url!=='/api/sales'||options?.method!=='POST')return fetch(url,options);
  const storageKey='oushadi-pending-checkout';
  let pending;
  try {pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');} catch {pending=null;}
  if(pending&&pending.body!==options.body)throw new Error('The previous checkout has an uncertain result. Retry it before changing the sale.');
  pending ||= {key:crypto.randomUUID(),body:options.body};
  sessionStorage.setItem(storageKey,JSON.stringify(pending));
  const response=await fetch(url,{...options,headers:{...options.headers,'Idempotency-Key':pending.key}});
  // Read a clone first: an interrupted response body is still an uncertain checkout.
  if(response.ok)await response.clone().json();
  if(response.ok||(response.status>=400&&response.status<500&&![408,429].includes(response.status)))sessionStorage.removeItem(storageKey);
  return response;
}
