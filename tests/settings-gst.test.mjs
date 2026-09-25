import test from "node:test";
import assert from "node:assert/strict";
import {SETTINGS_DEFAULTS,validateSettings} from "../src/services/settings.service.js";

const settings=()=>structuredClone(SETTINGS_DEFAULTS);

test("GST cannot be enabled without a registered GSTIN",()=>{
  const input=settings();
  input.gst.enabled=true;
  assert.equal(validateSettings(input)["store.gstin"],"Enter the registered GSTIN before enabling GST calculations.");
});

test("GST state must match the GSTIN state prefix",()=>{
  const input=settings();
  input.gst.enabled=true;
  input.store.gstin="32ABCDE1234F1Z5";
  input.store.stateCode="33";
  assert.equal(validateSettings(input)["store.stateCode"],"Store state must match the first two digits of the GSTIN.");
});

test("plausible GSTIN alone cannot enable collection for an unregistered supplier",()=>{
  const input=settings();
  input.gst.enabled=true;
  input.store.gstin="32ABCDE1234F1Z5";
  input.store.stateCode="32";
  assert.ok(validateSettings(input)["gst.enabled"]);
  assert.equal(validateSettings(input)["store.gstin"],undefined);
  assert.equal(validateSettings(input)["store.stateCode"],undefined);
});
