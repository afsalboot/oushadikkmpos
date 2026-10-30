import test from "node:test";
import assert from "node:assert/strict";
import { connectionErrorCode } from "./connection-error.mjs";

test("connection diagnostics retain Electron codes without leaking error URLs", () => {
  assert.equal(connectionErrorCode({ code: "ERR_CERT_DATE_INVALID" }), "ERR_CERT_DATE_INVALID");
  assert.equal(connectionErrorCode(new Error("ERR_NAME_NOT_RESOLVED (-105) loading 'https://user:secret@example.test/?token=private'")), "ERR_NAME_NOT_RESOLVED");
  assert.equal(connectionErrorCode({ code: "ERR_FAKE<script>", message: "private details" }), "UNKNOWN");
  assert.equal(connectionErrorCode(new Error("Request failed with private details")), "UNKNOWN");
  assert.equal(connectionErrorCode(null), "UNKNOWN");
});
