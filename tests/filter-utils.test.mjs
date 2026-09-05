import test from "node:test";
import assert from "node:assert/strict";
import {hasFilterValue,queryValues,serializedFilterEntries} from "../src/lib/filter-utils.js";

test("multi-select filters serialize without losing values that contain commas",()=>{
  const entries=serializedFilterEntries({paymentMethod:["CASH","UPI"],status:[],sort:"date"});
  assert.deepEqual(Object.fromEntries(entries),{paymentMethod:'["CASH","UPI"]',sort:"date"});
  assert.deepEqual(queryValues(new URLSearchParams({category:'["Clinic, General","Travel"]'}),"category"),["Clinic, General","Travel"]);
});

test("server query values accept comma-separated and repeated parameters",()=>{
  const parameters=new URLSearchParams("status=PAID,PARTIAL&status=UNPAID&ignored=x");
  assert.deepEqual(queryValues(parameters,"status",["PAID","PARTIAL","UNPAID"]),["PAID","PARTIAL","UNPAID"]);
});

test("empty arrays are not treated as active filters",()=>{
  assert.equal(hasFilterValue([]),false);
  assert.equal(hasFilterValue(["ACTIVE"]),true);
});
