import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutFetch,pendingCheckoutBody} from '../src/lib/checkout-request.js';

test('checkout retry retains its key across network and response-body failures', async t=>{
  const storage=new Map(),keys=[];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    keys.push(options.headers['Idempotency-Key']);
    if(keys.length===1)throw new TypeError('network interrupted');
    if(keys.length===2)return new Response('{',{status:201});
    return new Response(JSON.stringify({data:{invoiceNumber:'INV/26-27/000001'}}),{status:201});
  });
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  t.after(()=>previous?Object.defineProperty(globalThis,'sessionStorage',previous):delete globalThis.sessionStorage);
  const options={method:'POST',body:'{"items":[1]}',headers:{'Content-Type':'application/json'}};
  await assert.rejects(checkoutFetch('/api/sales',options),/network/);
  await assert.rejects(checkoutFetch('/api/sales',{...options,body:'{"items":[2]}'}),/uncertain/);
  await assert.rejects(checkoutFetch('/api/sales',options),SyntaxError);
  assert.equal(storage.size,1);
  const response=await checkoutFetch('/api/sales',options);
  assert.equal((await response.json()).data.invoiceNumber,'INV/26-27/000001');
  assert.equal(new Set(keys).size,1);
  assert.equal(storage.size,0);
});

test('an uncertain NEW-customer checkout retries its original body and key without resolving the now-created customer', async t=>{
  const storage=new Map(),requests=[];
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  t.after(()=>previous?Object.defineProperty(globalThis,'sessionStorage',previous):delete globalThis.sessionStorage);
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    requests.push(options);
    if(requests.length===1)return new Response(JSON.stringify({error:'uncertain'}),{status:503});
    return new Response(JSON.stringify({data:{invoiceNumber:'FIXTURE-ONLY'}}),{status:200});
  });
  const body=JSON.stringify({customerType:'NEW',customer:{name:'Fixture customer'},items:[1]});
  await checkoutFetch('/api/sales',{method:'POST',body,checkoutIntent:'unchanged fixture intent'});
  assert.throws(()=>pendingCheckoutBody('changed fixture intent'),/uncertain/);
  const retryBody=pendingCheckoutBody('unchanged fixture intent');
  assert.equal(retryBody,body);
  await checkoutFetch('/api/sales',{method:'POST',body:retryBody,checkoutIntent:'unchanged fixture intent'});
  assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.equal(requests[1].body,body);
  assert.equal('checkoutIntent' in requests[1],false);
  assert.equal(storage.size,0);
});

test('408 and throttling retain retry keys; definitive validation rejection allows a corrected request', async t=>{
  const storage=new Map(),keys=[];
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  t.after(()=>previous?Object.defineProperty(globalThis,'sessionStorage',previous):delete globalThis.sessionStorage);
  const statuses=[408,429,422,201];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{keys.push(options.headers['Idempotency-Key']);return new Response('{"data":{}}',{status:statuses.shift()});});
  for(const status of [408,429,422]){await checkoutFetch('/api/sales',{method:'POST',body:'{"fixture":1}'});assert.equal(storage.size,status===422?0:1);}
  await checkoutFetch('/api/sales',{method:'POST',body:'{"fixture":2}'});
  assert.equal(new Set(keys.slice(0,3)).size,1);
  assert.notEqual(keys[3],keys[0]);
});
