import test from "node:test";
import assert from "node:assert/strict";
import {calculatePurchaseTotals,receivedPackageQuantity} from "../src/lib/purchase-calculations.js";

test("free packages increase received inventory without increasing purchase cost",()=>{
  const item={packageQuantity:10,freeQuantity:2,unitCost:120};
  assert.equal(receivedPackageQuantity(item),12);
  assert.deepEqual(calculatePurchaseTotals([item]),{subtotal:1200,additionalCharges:0,discountType:"FIXED",discountValue:0,discount:0,taxableAmount:1200,totalGst:0,cgst:0,sgst:0,igst:0,total:1200});
});

test("purchase totals apply charges and percentage discounts once",()=>{
  const totals=calculatePurchaseTotals([{packageQuantity:10,freeQuantity:5,unitCost:100}],{additionalCharges:200,discountType:"PERCENTAGE",discountValue:10});
  assert.deepEqual(totals,{subtotal:1000,additionalCharges:200,discountType:"PERCENTAGE",discountValue:10,discount:100,taxableAmount:900,totalGst:0,cgst:0,sgst:0,igst:0,total:1100});
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
