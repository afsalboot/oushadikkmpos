import test from "node:test";
import assert from "node:assert/strict";
import {calculatePurchaseTotals,receivedPackageQuantity} from "../src/lib/purchase-calculations.js";

test("free packages increase received inventory without increasing purchase cost",()=>{
  const item={packageQuantity:10,freeQuantity:2,unitCost:120};
  assert.equal(receivedPackageQuantity(item),12);
  const result=calculatePurchaseTotals([item]);
  assert.equal(result.subtotal,1200);assert.equal(result.total,1200);assert.equal(result.totalGst,0);assert.equal(result.taxLines[0].lineTotal,1200);
});

test("purchase totals apply charges and percentage discounts once",()=>{
  const totals=calculatePurchaseTotals([{packageQuantity:10,freeQuantity:5,unitCost:100}],{additionalCharges:200,discountType:"PERCENTAGE",discountValue:10});
  assert.equal(totals.total,1100);assert.equal(totals.taxableAmount,1100);assert.equal(totals.taxLines[0].taxableAmount,900);assert.equal(totals.discount,100);assert.equal(totals.totalGst,0);
});

test("purchase GST preserves inclusive and exclusive invoice treatment",()=>{
  const inclusive=calculatePurchaseTotals([{packageQuantity:1,unitCost:105,gstRate:5,gstPriceMode:"INCLUSIVE",taxType:"CGST_SGST"}]);
  assert.equal(inclusive.total,105);assert.equal(inclusive.totalGst,5);assert.equal(inclusive.cgst,2.5);assert.equal(inclusive.sgst,2.5);
  const exclusive=calculatePurchaseTotals([{packageQuantity:1,unitCost:100,gstRate:5,gstPriceMode:"EXCLUSIVE",taxType:"IGST"}]);
  assert.equal(exclusive.total,105);assert.equal(exclusive.totalGst,5);assert.equal(exclusive.igst,5);
});

test("purchase totals reject discounts larger than the payable value",()=>{
  assert.throws(()=>calculatePurchaseTotals([{packageQuantity:1,unitCost:100}],{discountValue:101}),/Discount cannot exceed/);
});
