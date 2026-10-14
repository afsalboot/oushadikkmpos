import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acquireCheckoutSubmit } from '../src/lib/checkout-submit.js';
import { checkoutPayments } from '../src/lib/checkout-payment.js';
import { resolveCheckoutCustomer } from '../src/lib/checkout-customer.js';
import { isWholesaleCustomer } from '../src/lib/sale-customer.js';
import { isExternalPurchase } from '../src/lib/external-purchase.js';

// Exercise the actual component handler with isolated dependencies, not a DB.
const component = readFileSync(new URL('../src/components/SalesCheckoutHostV2.jsx',import.meta.url),'utf8');
const handler = component.slice(component.indexOf('  async function complete('),component.indexOf('  function chooseType('));
function fixture(overrides={}) {
  const state={posts:[],errors:[],saving:[],events:[],releaseLookup:null};
  const lookup=new Promise(resolve=>{state.releaseLookup=resolve;});
  const noop=()=>{};
  const dependencies={acquireCheckoutSubmit,submitRef:{current:false},setSaving:value=>state.saving.push(value),
    customerType:'NEW',directoryType:'RETAIL',selected:null,isWholesaleCustomer,setSelected:noop,
    paymentValid:true,paymentError:'',payment:'CASH',creditLimit:0,availableCredit:0,money:String,
    toast:{error:value=>state.errors.push(value),success:noop},saleType:'SALE',pricing:{validationErrors:[]},
    fulfilment:'COUNTER',deliveryAddress:'',deliveryStateCode:'',recipientStateCode:'',cacheScope:'volatile:isolated-fixture',findDuplicate:async()=>{await lookup;return null;},
    cart:[{kind:'PRODUCT',productId:'000000000000000000000001',saleMode:'PACKAGE',quantity:1}],isExternalPurchase,
    wholesaleDiscountEnabled:false,checkoutPayments,total:100,splitCash:'',splitUpi:'',reference:'',
    editingSale:null,cartCustomer:{doctorName:''},discountType:'FIXED',discountReason:'',
    customerName:'Isolated customer',customerPhone:'',pendingCheckoutBody:()=>null,
    searchRetailCustomers:async()=>{await lookup;return [];},setResults:noop,resolveCheckoutCustomer,
    api:async(url,options)=>{state.posts.push({url,options});return {invoiceNumber:'FIXTURE-ONLY'};},
    lifetimeRef:{current:{active:true}},sessionStorage:{removeItem:noop},setOpen:noop,
    window:{dispatchEvent:event=>state.events.push(event.type)},CustomEvent, setDuplicate:noop, ...overrides};
  const complete=new Function(...Object.keys(dependencies),`${handler};return complete;`)(...Object.values(dependencies));
  return {state,dependencies,complete};
}
test('same-turn duplicate clicks during retail resolution submit once',async()=>{
  const h=fixture();
  const first=h.complete();
  await h.complete();
  assert.equal(h.dependencies.submitRef.current,true);
  assert.equal(h.state.posts.length,0);
  h.state.releaseLookup();await first;
  assert.equal(h.state.posts.length,1);
  assert.equal(JSON.parse(h.state.posts[0].options.body).customerType,'NEW');
  assert.deepEqual(h.state.events,['oushadi-sale-complete','oushadi-sale-success']);
  assert.deepEqual(h.state.saving,[true,false]);
});
test('wholesale duplicate lookup is covered by the synchronous guard',async()=>{
  const h=fixture({saleType:'WHOLESALE',directoryType:'WHOLESALE'});
  const first=h.complete();await h.complete();
  assert.equal(h.state.posts.length,0);
  h.state.releaseLookup();await first;
  assert.equal(h.state.posts.length,1);
});
test('validation and request failures release the guard for a retry',async()=>{
  const invalid=fixture({customerType:'EXISTING'});await invalid.complete();
  assert.equal(invalid.dependencies.submitRef.current,false);
  assert.equal(invalid.state.posts.length,0);
  const h=fixture({api:async()=>{throw new Error('isolated network failure');}});
  h.state.releaseLookup();await h.complete();await h.complete();
  assert.equal(h.dependencies.submitRef.current,false);
  assert.deepEqual(h.state.errors,['isolated network failure','isolated network failure']);
});
test('an unmounted checkout cannot submit after late customer resolution',async()=>{
  const h=fixture();const first=h.complete();
  h.dependencies.lifetimeRef.current.active=false;
  h.state.releaseLookup();await first;
  assert.equal(h.state.posts.length,0);
  assert.equal(h.state.events.length,0);
});
test('an uncertain retry bypasses customer lookup and uses the original payload',async()=>{
  const body=JSON.stringify({customerType:'NEW',customer:{name:'Original fixture customer'},items:[]});
  const h=fixture({pendingCheckoutBody:()=>body,searchRetailCustomers:()=>{throw new Error('Retry must not look up the created customer');}});
  await h.complete();
  assert.equal(h.state.posts[0].options.body,body);
});
