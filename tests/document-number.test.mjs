import test from "node:test";
import assert from "node:assert/strict";
import { formatDocumentDateTime, maxDocumentSequence, nextDocumentNumber } from "../src/services/document-number.service.js";

test("formats document date-time in the store timezone",()=>{assert.equal(formatDocumentDateTime("2026-08-15T12:30:45.000Z"),"20260815180045");});
test("adds a continuous three digit sequence",async()=>{let sequence=1;const Counter={findOneAndUpdate:async(_filter,update)=>update.$inc?{sequence:++sequence}:{sequence}};assert.equal(await nextDocumentNumber({Counter,prefix:"inv",value:"2026-08-15T12:30:45.000Z",minimumSequence:1}),"INV-20260815180045-002");});
test("finds the highest existing suffix across different timestamps",()=>{assert.equal(maxDocumentSequence(["PUR-20260815204107-001","PUR-20260815204210-009","legacy"]),9);});
