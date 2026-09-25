import test from 'node:test';
import assert from 'node:assert/strict';
import {Sale,Customer,Purchase} from '../src/models/index.js';

test('fiscal schema extensions are accessible on actual mongoose documents',()=>{
  const sale=new Sale({documentType:'TAX_INVOICE',financialYear:'2026-27',requestKey:'checkout-test-key',registrationSnapshot:{status:'REGULAR'},utgst:3});
  assert.equal(sale.documentType,'TAX_INVOICE');
  assert.equal(sale.financialYear,'2026-27');
  assert.equal(sale.requestKey,'checkout-test-key');
  assert.equal(sale.registrationSnapshot.status,'REGULAR');
  assert.equal(sale.toObject().utgst,3);
  assert.equal(new Customer({stateCode:'32'}).stateCode,'32');
  assert.equal(new Purchase({additionalChargesTax:2}).additionalChargesTax,2);
  assert.ok(Sale.schema.indexes().some(([keys,options])=>keys.requestKey===1&&options.unique));
});

test('an existing mongoose invoice cannot replace immutable totals or numbering',()=>{
  const sale=Sale.hydrate({invoiceNumber:'INV/26-27/000001',total:100,documentType:'COMMERCIAL_INVOICE'});
  sale.total=1;sale.invoiceNumber='CHANGED';sale.documentType='TAX_INVOICE';
  assert.equal(sale.total,100);
  assert.equal(sale.invoiceNumber,'INV/26-27/000001');
  assert.equal(sale.documentType,'COMMERCIAL_INVOICE');
});
