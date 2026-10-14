import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutPaymentOptions, checkoutPayments, validateSalePayments } from '../src/lib/checkout-payment.js';
import { directCheckoutPayments } from '../src/lib/direct-checkout.js';

const settings = { payments: { enabledMethods:['CASH','UPI','BANK'], splitPayment:true, upi:{requireReference:true}, bank:{requireReference:true} } };
test('payment options follow enabled methods and split Settings without allowing retail credit', () => {
  assert.deepEqual(checkoutPaymentOptions(settings), ['CASH','UPI','BANK','SPLIT']);
  assert.deepEqual(checkoutPaymentOptions({payments:{enabledMethods:['BANK'],splitPayment:false}}, true), ['BANK','CREDIT']);
  assert.deepEqual(checkoutPaymentOptions({payments:{enabledMethods:['CASH'],splitPayment:true}}), ['CASH']);
});
test('required UPI and bank references match the server and trim accepted references', () => {
  for (const method of ['UPI','BANK']) {
    assert.throws(()=>validateSalePayments(settings,checkoutPayments(method,100),100), /reference is required/);
    assert.equal(validateSalePayments(settings,checkoutPayments(method,100,{reference:' ref-1 '}),100)[0].reference,'ref-1');
  }
});
test('split payments require positive components and the exact invoice total', () => {
  const split = (cash,upi)=>checkoutPayments('SPLIT',100,{splitCash:cash,splitUpi:upi,reference:'ref-1'});
  assert.equal(validateSalePayments(settings,split(40,60),100).length,2);
  for(const parts of [[100,0],[0,100],[40,59.99],[40,60.01],[-1,101],['NaN',100]]) assert.throws(()=>validateSalePayments(settings,split(...parts),100));
  assert.throws(()=>validateSalePayments({...settings,payments:{...settings.payments,splitPayment:false}},split(40,60),100),/Split payment is disabled/);
});
test('decimal payment normalization preserves the existing server money arithmetic', () => {
  assert.equal(validateSalePayments(settings,[{method:'CASH',amount:1.005}],1.01)[0].amount,1.01);
  assert.equal(validateSalePayments(settings,[{method:'CASH',amount:'123.45'}],123.45)[0].amount,123.45);
  for(const amount of [Infinity,NaN,0,-1]) assert.throws(()=>validateSalePayments(settings,[{method:'CASH',amount}],100));
});
test('direct checkout uses authoritative total and Settings while credit stays separately validated', () => {
  const disabled={...settings,checkout:{enabled:false}};
  const payments=directCheckoutPayments(disabled,123.45,{skipCheckout:true,payments:[{method:'UPI',amount:1}]});
  assert.deepEqual(validateSalePayments(disabled,payments,123.45),[{method:'CASH',amount:123.45,reference:''}]);
  assert.throws(()=>directCheckoutPayments(disabled,123.45,{skipCheckout:true,credit:true}), /Cash payment/);
  assert.deepEqual(validateSalePayments(settings,[],100,true),[]);
});
