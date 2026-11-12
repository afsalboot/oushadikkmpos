import test from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_DEFAULTS, normalizeSettings, validateSettings } from "../src/services/settings.service.js";
import { receiptAppearance, receiptDocument } from "../src/lib/receipt-appearance.js";

test("old settings retain the original receipt appearance", () => {
  const settings = normalizeSettings({ receipt: { width: "58mm" } });
  assert.equal(settings.receipt.font, "ARIAL");
  assert.equal(settings.receipt.intensity, 0);
  assert.equal(receiptAppearance(settings.receipt).textStroke, 0);
  assert.equal(receiptAppearance(settings.receipt).logoSpread, 0);
});

test("receipt settings accept supported fonts and the full intensity range", () => {
  for (const font of ["ARIAL", "VERDANA", "TAHOMA", "COURIER_NEW", "TIMES_NEW_ROMAN"]) {
    for (const intensity of [0, 1, 50, 100]) {
      const settings = normalizeSettings({ receipt: { font, intensity } });
      assert.equal(validateSettings(settings)["receipt.font"], undefined);
      assert.equal(validateSettings(settings)["receipt.intensity"], undefined);
      assert.equal(settings.receipt.intensity, intensity);
    }
  }
});

test("receipt settings reject unsupported fonts and invalid intensity without silently saving them", () => {
  for (const font of ["Comic Sans", "__proto__", "toString", "ARIAL; color:red"]) {
    const settings = normalizeSettings({ receipt: { font } });
    assert.ok(validateSettings(settings)["receipt.font"]);
  }
  for (const intensity of [-1, 101, 1.5, "50", "", null, NaN, Infinity]) {
    const settings = structuredClone(SETTINGS_DEFAULTS);
    settings.receipt.intensity = intensity;
    assert.ok(validateSettings(settings)["receipt.intensity"], String(intensity));
  }
});

test("intensity strengthens text and logo strokes without fading black ink", () => {
  const normal = receiptAppearance({ intensity: 0 });
  const medium = receiptAppearance({ intensity: 50 });
  const strong = receiptAppearance({ intensity: 100 });
  assert.ok(normal.textStroke < medium.textStroke && medium.textStroke < strong.textStroke);
  assert.ok(normal.logoSpread < medium.logoSpread && medium.logoSpread < strong.logoSpread);
  const html = receiptDocument('<div class="thermal-receipt">SAMPLE ₹60.00</div>', { intensity: 100 });
  assert.match(html, /-webkit-text-stroke:0\.45px #000/);
  assert.match(html, /feMorphology[^>]*radius="0\.45"/);
  assert.match(html, /color:#000/);
  assert.match(html, /SAMPLE ₹60\.00/);
  assert.doesNotMatch(html, /opacity:/);
});

test("print documents use the selected font and safe paper widths, including hostile legacy settings", () => {
  const html = receiptDocument('<div class="thermal-receipt">Test</div>', { width: "58mm", font: "COURIER_NEW", intensity: 50 });
  assert.match(html, /font-family:'Courier New',monospace/);
  assert.match(html, /width:50mm/);
  assert.match(html, /max-width:58mm/);
  const hostile = receiptDocument("Test", { width: "</style><script>alert(1)</script>", font: "</style><script>alert(2)</script>", intensity: "</style>" });
  assert.doesNotMatch(hostile, /<script>/);
  assert.match(hostile, /font-family:Arial,sans-serif/);
  assert.equal(receiptAppearance({ intensity: -100 }).intensity, 0);
  assert.equal(receiptAppearance({ intensity: 200 }).intensity, 100);
});
