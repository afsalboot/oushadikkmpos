import test from "node:test";
import assert from "node:assert/strict";
import {reportCsv,validPayments} from "../src/services/report.service.js";

test("report split payments never exceed invoice revenue",()=>{
  const payments=validPayments({total:1000,payments:[{method:"CASH",amount:600},{method:"UPI",amount:400},{method:"CASH",amount:1000}]});
  assert.deepEqual(payments.map(({method,amount})=>({method,amount})),[{method:"CASH",amount:600},{method:"UPI",amount:400}]);
  assert.equal(payments.reduce((sum,row)=>sum+row.amount,0),1000);
});

test("report CSV exports only declared human-readable columns",()=>{
  const csv=reportCsv({columns:[{key:"invoice",label:"Invoice"},{key:"total",label:"Total"}],rows:[{invoice:"INV-001",total:250,_id:"private-id"}]});
  assert.match(csv,/Invoice,?"?/);
  assert.match(csv,/INV-001/);
  assert.doesNotMatch(csv,/private-id/);
});
