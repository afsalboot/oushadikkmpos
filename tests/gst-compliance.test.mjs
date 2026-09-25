import test from 'node:test';
import assert from 'node:assert/strict';
import {gstinError,registrationErrors,assertRegistration,resolveSupply,validateFiscalLines,financialYear} from '../src/lib/gst-compliance.js';
import {minor,multiplyMoney,percentageMoney,allocateMoney,sumMoney} from '../src/lib/money.js';
import {calculateGstInvoice} from '../src/services/gst.service.js';
import {calculateSalePricing} from '../src/services/pricing.service.js';
import {calculatePurchaseTotals} from '../src/lib/purchase-calculations.js';
import {nextInvoiceNumber} from '../src/services/document-number.service.js';
import {assertRestorePreservesDocuments,requestHash,assertRetryMatches} from '../src/lib/fiscal-integrity.js';
import {buildGstRegister} from '../src/lib/gst-register.js';
import {normalizeSettings,validateSettings} from '../src/services/settings.service.js';

function checkedGstin(prefix='32ABCDE1234F1Z'){
  return [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c=>prefix+c).find(value=>!gstinError(value));
}
const settings=()=>({store:{name:'Store',legalName:'Test legal business',address:'Test street',stateCode:'32',gstin:checkedGstin()},gst:{enabled:true,registrationStatus:'REGULAR',effectiveFrom:'2020-01-01',verificationReference:'Synthetic test profile',precedingYearTurnover:1000000,highestTurnover:1000000,priceMode:'EXCLUSIVE',defaultRate:5}});
const line=(amount,rate,extra={})=>({name:'Item',amount,gstRate:rate,useDefaultGstRate:false,hsnCode:'3004',...extra});
const calculate=(lines,extra={})=>calculateGstInvoice({lines,settings:settings(),placeOfSupply:'32',...extra});

test('unregistered profile cannot collect output GST even with a plausible GSTIN',()=>{
  const input=settings();input.gst.registrationStatus='UNREGISTERED';
  assert.ok(registrationErrors(input)['gst.enabled']);assert.throws(()=>assertRegistration(input),/Only an active/);
  assert.equal(calculate([line(100,18)],{settings:input}).tax,0);
});
test('complete regular registration is accepted; required metadata is not just a regex',()=>{
  assert.deepEqual(registrationErrors(settings()),{});
  const input=normalizeSettings(settings());assert.deepEqual(validateSettings(input),{});
  for(const field of ['legalName','address']){const invalid=settings();invalid.store[field]='';assert.ok(Object.keys(registrationErrors(invalid)).length);}
});
test('checksum and state detect malformed supplier/customer IDs',()=>{
  const valid=checkedGstin();assert.equal(gstinError(valid),'');assert.match(gstinError(valid,'33'),/state/);
  assert.match(gstinError(valid.slice(0,14)+(valid[14]==='0'?'1':'0')),/checksum/);
  assert.match(gstinError('99ABCDE1234F1Z5'),/state/);
});
test('invalid calendar dates, future registration and expired registration fail',()=>{
  for(const patch of [{effectiveFrom:'2026-02-30'},{effectiveFrom:'2099-01-01'},{effectiveTo:'2020-02-01'},{effectiveTo:'wrong'}])assert.ok(Object.keys(registrationErrors({...settings(),gst:{...settings().gst,...patch}})).length);
});
test('composition never separately collects GST',()=>{
  const input=settings();input.gst.registrationStatus='COMPOSITION';assert.throws(()=>assertRegistration(input),/Only an active/);
  input.gst.enabled=false;assert.doesNotThrow(()=>assertRegistration(input));
  assert.equal(calculate([line(100,18)],{settings:input}).total,100);
});
test('delivery address determines ordinary interstate B2C supply',()=>{
  const value=resolveSupply(settings(),{name:'Recipient',address:'Billing Kerala',stateCode:'32'},{fulfilment:'DELIVERY',deliveryAddress:'Delivery Tamil Nadu',deliveryStateCode:'33'});
  assert.equal(value.placeOfSupply,'33');assert.equal(value.ruleBasis,'IGST_10_1_CA');
  assert.equal(calculate([line(100,18)],{placeOfSupply:value.placeOfSupply}).igst,18);
});
test('B2C counter address on record determines POS; anonymous counter defaults supplier',()=>{
  assert.equal(resolveSupply(settings(),{name:'Buyer',stateCode:'33',address:'TN'}).placeOfSupply,'33');
  assert.equal(resolveSupply(settings(),null).placeOfSupply,'32');
});
test('special supplies and invalid delivery states cannot silently be ordinary goods',()=>{
  for(const input of [{service:true},{sez:true},{export:true},{reverseCharge:true},{billToShipTo:true},{fulfilment:'DELIVERY',deliveryStateCode:'99',deliveryAddress:'X'}])assert.throws(()=>resolveSupply(settings(),null,input));
});
test('UTGST and SGST stay distinct and components reconcile',()=>{
  const input=settings();input.store.stateCode='04';
  const tax=calculate([line(100,18)],{settings:input,placeOfSupply:'04'});
  assert.equal(tax.taxType,'CGST_UTGST');assert.equal(tax.utgst,9);assert.equal(tax.sgst,0);assert.equal(tax.cgst,9);
});
test('tax invoice, bill of supply and commercial invoice are distinct',()=>{
  const supply={recipientStatus:'UNREGISTERED'};
  assert.equal(validateFiscalLines([line(100,18)],settings(),supply,118),'TAX_INVOICE');
  assert.equal(validateFiscalLines([line(100,0,{gstExempt:true})],settings(),supply,100),'BILL_OF_SUPPLY');
  assert.equal(validateFiscalLines([line(100,0,{gstExempt:true}),line(100,18)],settings(),supply,218),'INVOICE_CUM_BILL_OF_SUPPLY');
  assert.equal(validateFiscalLines([line(100,18)],{gst:{registrationStatus:'UNREGISTERED'}},supply,100),'COMMERCIAL_INVOICE');
});
test('B2B identity, large B2C identity, HSN and unclassified mixtures are blocked',()=>{
  assert.throws(()=>validateFiscalLines([line(100,18)],settings(),{recipientStatus:'REGISTERED'},118),/name and billing/);
  assert.throws(()=>validateFiscalLines([line(100,18)],settings(),{recipientStatus:'UNREGISTERED'},50000),/Recipient/);
  for(const item of [line(100,18,{hsnCode:'12345'}),line(100,18,{kind:'MIX'}),line(100,18,{useDefaultGstRate:true})])assert.throws(()=>validateFiscalLines([item],settings(),{recipientStatus:'UNREGISTERED'},118));
});
test('potentially mandated e-invoice fails closed rather than issuing without IRN',()=>{
  const input=settings();input.gst.highestTurnover=50000001;
  assert.throws(()=>validateFiscalLines([line(100,18)],input,{recipientStatus:'REGISTERED'},118),/IRP/);
});
test('HSN requirements increase with preceding-year turnover',()=>{
  const input=settings();input.gst.precedingYearTurnover=50000001;
  assert.throws(()=>validateFiscalLines([line(100,18)],input,{recipientStatus:'UNREGISTERED'},118),/6 or 8/);
});
test('line discount stays with the 5 percent item',()=>{
  const input=settings();input.discount={enabled:true,itemLevel:true,allowAdmin:true};
  const result=calculateSalePricing({items:[line(1000,5,{discount:{type:'FIXED',value:100}}),line(1000,18)],settings:input,currentUser:{role:'ADMIN'}});
  assert.equal(result.gst.tax,225);assert.equal(result.total,2125);assert.deepEqual(result.gst.lines.map(l=>l.discount),[100,0]);
});
test('discount eligibility is respected',()=>{
  const input=settings();input.discount={enabled:true,allowTaxExempt:false};
  const result=calculateSalePricing({items:[line(100,0,{gstExempt:true}),line(100,18)],discount:{value:20},settings:input,currentUser:{role:'ADMIN'}});
  assert.deepEqual(result.gst.lines.map(l=>l.discount),[0,20]);assert.equal(result.total,194.4);
});
test('largest remainder never over-allocates discount across tiny lines',()=>{
  const result=calculate([line(.01,0),line(.01,0),line(.01,0),line(.01,0)],{discount:.02});
  assert.equal(result.total,.02);assert.equal(sumMoney(result.lines.map(l=>l.discount)),.02);
  for(let cents=0;cents<=100;cents++){const allocations=allocateMoney(cents/100,[.13,.27,.6]);assert.equal(minor(sumMoney(allocations)),cents);}
});
test('decimal arithmetic handles ties, precise unit prices and inclusive tax',()=>{
  assert.equal(minor('1.005'),101);assert.equal(minor('-1.005'),-101);
  assert.equal(multiplyMoney('0.25','400'),100);assert.equal(multiplyMoney('25','0.123456'),3.09);
  assert.equal(percentageMoney('114','14',{extractBase:true}),100);assert.equal(percentageMoney('100','14'),14);
  assert.throws(()=>minor(Infinity));assert.throws(()=>minor('999999999999999999'));
});
test('multiple rates and product inclusive/exclusive overrides reconcile',()=>{
  const result=calculate([line(105,5,{gstPriceMode:'INCLUSIVE'}),line(100,18)]);
  assert.equal(result.total,223);assert.equal(result.tax,23);assert.equal(result.taxableAmount,200);
});
test('odd paise components conserve invoice tax across many lines',()=>{
  const result=calculate(Array.from({length:101},()=>line(1,5)));
  assert.equal(sumMoney([result.cgst,result.sgst]),result.tax);
  assert.ok(Math.abs(minor(result.cgst)-minor(result.sgst))<=1);
  for(const item of result.lines)assert.equal(sumMoney([item.cgst,item.sgst]),item.totalGST);
});
test('purchase inclusive base and discounted exclusive tax are corrected',()=>{
  const result=calculatePurchaseTotals([{packageQuantity:1,unitCost:105,gstRate:5,taxType:'CGST_SGST'}]);
  assert.equal(result.taxableAmount,100);assert.equal(result.total,105);
  const discounted=calculatePurchaseTotals([{packageQuantity:1,unitCost:1000,gstRate:18,gstPriceMode:'EXCLUSIVE',taxType:'CGST_SGST'}],{discountValue:100});
  assert.equal(discounted.totalGst,162);assert.equal(discounted.total,1062);
});
test('purchase odd-paise tax and additional charge tax reconcile',()=>{
  const result=calculatePurchaseTotals([{packageQuantity:1,unitCost:1,gstRate:5,gstPriceMode:'EXCLUSIVE',taxType:'CGST_SGST'}],{additionalCharges:100,additionalChargesGstRate:18,additionalChargesTaxType:'IGST'});
  assert.equal(sumMoney([result.cgst,result.sgst,result.igst]),result.totalGst);assert.equal(result.total,119.05);
  assert.throws(()=>calculatePurchaseTotals([{packageQuantity:1,unitCost:100,gstRate:18,taxType:'NONE'}]),/tax type/);
});
test('fiscal numbering uses IST financial year and never changes scope on registration',async()=>{
  assert.equal(financialYear('2026-03-31T18:29:59Z'),'2025-26');assert.equal(financialYear('2026-03-31T18:30:00Z'),'2026-27');
  const counters=new Map();const Counter={findOneAndUpdate:async({key})=>{const sequence=(counters.get(key)||0)+1;counters.set(key,sequence);return{sequence};}};
  const a=await nextInvoiceNumber({Counter,value:'2026-09-10',registrationKey:'UNREGISTERED'}),b=await nextInvoiceNumber({Counter,value:'2026-09-10',registrationKey:'REGISTERED'});
  assert.equal(a,'INV/26-27/000001');assert.equal(b,'INV/26-27/000002');assert.ok(a.length<=16);
  await assert.rejects(()=>nextInvoiceNumber({Counter,prefix:'TOOLONG'}),/series/);
  await assert.rejects(()=>nextInvoiceNumber({Counter:{findOneAndUpdate:async()=>({sequence:1000000})}}),/full/);
});
test('restore rejects removed or altered issued documents',()=>{
  const original={_id:'1',invoiceNumber:'INV/26-27/000001',createdAt:new Date('2026-09-10'),total:100};
  assert.doesNotThrow(()=>assertRestorePreservesDocuments([original],JSON.parse(JSON.stringify([original]))));
  assert.throws(()=>assertRestorePreservesDocuments([original],[]),/remove or change/);
  assert.throws(()=>assertRestorePreservesDocuments([original],[{...original,total:90}]),/remove or change/);
});
test('idempotency validates actor and request fingerprint',()=>{
  assert.equal(requestHash({a:1,b:2}),requestHash({b:2,a:1}));
  const sale={actorId:'actor',requestHash:requestHash({total:1})};
  assert.equal(assertRetryMatches(sale,requestHash({total:1}),'actor'),sale);
  assert.throws(()=>assertRetryMatches(sale,requestHash({total:2}),'actor'),/different request/);
  assert.throws(()=>assertRetryMatches(sale,sale.requestHash,'other'),/different request/);
});
test('fiscal register includes unpaid supplies and preserves snapshot HSN',()=>{
  const invoice={invoiceNumber:'X',createdAt:'2026-09-10',paymentStatus:'UNPAID',total:118,tax:18,gstEnabled:true,registrationSnapshot:{status:'REGULAR'},customerSnapshot:{name:'Customer',gstin:checkedGstin()},items:[{name:'Original',hsnCode:'3004',quantity:1,unitPrice:100,taxableValue:100,gstRate:18,cgst:9,sgst:9,totalTax:18,total:118}]};
  const rows=buildGstRegister([invoice]);assert.equal(rows.length,1);assert.equal(rows[0].paymentStatus,'UNPAID');assert.equal(rows[0].category,'B2B');assert.equal(rows[0].hsn,'3004');
  assert.equal(buildGstRegister([{...invoice,documentStatus:'CANCELLED'}],{hsn:true}).length,0);
});
