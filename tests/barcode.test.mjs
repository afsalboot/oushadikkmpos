import test from "node:test";
import assert from "node:assert/strict";
import { detectBarcodeType, looksLikeBarcode, normalizeBarcode, validateBarcode } from "../src/lib/barcode.js";

test("barcode normalization preserves identifiers but removes surrounding whitespace",()=>{
  assert.equal(normalizeBarcode(" 8901234567890 "),"8901234567890");
  assert.equal(normalizeBarcode("   "),undefined);
});

test("barcode validation rejects embedded spaces and accepts internal Code 128 values",()=>{
  assert.deepEqual(validateBarcode("POS-00000125"),[]);
  assert.match(validateBarcode("8901 2345").join(" "),/must not contain spaces/);
});

test("barcode format detection covers common retail identifiers",()=>{
  assert.equal(detectBarcodeType("8901234567890"),"EAN13");
  assert.equal(detectBarcodeType("12345678"),"EAN8");
  assert.equal(detectBarcodeType("POS-00000125"),"CODE39");
  assert.equal(looksLikeBarcode("8901234567890"),true);
});
