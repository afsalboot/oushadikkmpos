import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutFetch} from '../src/lib/checkout-request.js';

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
