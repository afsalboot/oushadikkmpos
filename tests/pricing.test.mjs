import test from "node:test";import assert from "node:assert/strict";import {calculateConfiguredDiscount,calculateRoundOff,calculateSaleTotal,calculateSalePricing} from "../src/services/pricing.service.js";

test("bill percentage covers retail and wholesale lines without item discounts", () => {
  const result = calculateSalePricing({
    items: [{kind:"PRODUCT",saleMode:"PACKAGE",amount:60},{kind:"PRODUCT",saleMode:"WHOLESALE",amount:140}],
    discount: {type:"PERCENTAGE",value:10,reason:"Regular Customer"},
    settings: {discount:{enabled:true,cartLevel:true,itemLevel:false,allowPercentage:true,maxPercentage:20,requireReason:true},gst:{enabled:false},roundOff:{enabled:false}},
    currentUser: {role:"ADMIN"},
  });
  assert.equal(result.itemDiscount,0);
  assert.equal(result.cartDiscount,20);
  assert.equal(result.total,180);
  assert.deepEqual(result.validationErrors,[]);
});

test("bill discount retains staff approval and store maximum restrictions", () => {
  const result = calculateSalePricing({
    items: [{amount:1000}], discount:{type:"PERCENTAGE",value:25},
    settings:{discount:{enabled:true,cartLevel:true,allowPercentage:true,maxPercentage:20,staffMaxPercentage:10,staffMaxFixed:200,approvalPercentage:10,approvalFixedAmount:500},gst:{enabled:false},roundOff:{enabled:false}},
    currentUser:{role:"STAFF"},
  });
  assert.equal(result.approvalRequired,true);
  assert.ok(result.validationErrors.some((error)=>error.includes("20%")));
});
test("nearest rupee round off",()=>assert.equal(calculateRoundOff(499.7,"NEAREST_1"),.3));
test("disabled discount and round off are fully ignored",()=>assert.deepEqual(calculateSaleTotal({subtotal:499.7,discount:50,settings:{discount:{enabled:false},roundOff:{enabled:false}}}),{subtotal:499.7,discount:0,roundOff:0,total:499.7}));
test("enabled settings apply discount then round off",()=>assert.deepEqual(calculateSaleTotal({subtotal:549.7,discount:50,settings:{discount:{enabled:true},roundOff:{enabled:true,method:"NEAREST_1"}}}),{subtotal:549.7,discount:50,roundOff:.3,total:500}));
test("configured percentage discount is calculated from the cart subtotal",()=>assert.equal(calculateConfiguredDiscount({subtotal:750,type:"PERCENTAGE",value:10,settings:{discount:{enabled:true,allowPercentage:true,maxStaffPercentage:20}}}),75));
test("configured fixed discount respects its maximum",()=>assert.throws(()=>calculateConfiguredDiscount({subtotal:750,type:"FIXED",value:501,settings:{discount:{enabled:true,allowFixed:true,maxFixedAmount:500}}}),/cannot exceed/));
test("round off is calculated after discount",()=>assert.deepEqual(calculateSaleTotal({subtotal:100.6,discount:10,settings:{discount:{enabled:true},roundOff:{enabled:true,method:"DOWN"}}}),{subtotal:100.6,discount:10,roundOff:-.6,total:90}));
