import { receiptLayout } from "./receipt-layout.js";

export const RECEIPT_FONTS = [
  ["ARIAL", "Arial (original)", "Arial,sans-serif"],
  ["VERDANA", "Verdana", "Verdana,sans-serif"],
  ["TAHOMA", "Tahoma", "Tahoma,sans-serif"],
  ["COURIER_NEW", "Courier New", "'Courier New',monospace"],
  ["TIMES_NEW_ROMAN", "Times New Roman", "'Times New Roman',serif"],
];

export const RECEIPT_APPEARANCE_DEFAULTS = { font: "ARIAL", intensity: 0 };

export function receiptAppearanceErrors(receipt) {
  const errors = {};
  if (!RECEIPT_FONTS.some(([key]) => key === receipt?.font)) {
    errors["receipt.font"] = "Choose a receipt font from the list.";
  }
  if (!Number.isInteger(receipt?.intensity) || receipt.intensity < 0 || receipt.intensity > 100) {
    errors["receipt.intensity"] = "Print intensity must be a whole number from 0 to 100%.";
  }
  return errors;
}

export function receiptAppearance(receipt = {}) {
  const font = RECEIPT_FONTS.find(([key]) => key === receipt?.font) || RECEIPT_FONTS[0];
  const intensity = Number.isFinite(receipt?.intensity)
    ? Math.max(0, Math.min(100, receipt.intensity)) : 0;
  // Black is already at maximum opacity. Grow ink strokes instead of fading it.
  const spread = Number((intensity * 0.0045).toFixed(4));
  return { fontFamily: font[2], intensity, textStroke: spread, logoSpread: spread };
}

// Shared by the preview, browser printing and Electron's copied print document.
// Only allowlisted font stacks and bounded numbers enter the stylesheet.
export function receiptDocument(html, receipt = {}) {
  const layout = receiptLayout(receipt || {});
  const appearance = receiptAppearance(receipt);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt print</title><style>
    @font-face{font-family:OushadhiPrint;src:url("/fonts/UncialAntiqua-Regular.ttf") format("truetype");font-weight:400;font-style:normal}
    .receipt-wordmark{margin-bottom:6px}
    .oushadhi-logo{display:inline-flex;align-items:baseline;gap:7px;white-space:nowrap;color:#000}
    .oushadhi-logo__word{font-family:OushadhiPrint,serif;font-size:26px;font-weight:400;line-height:1.15;letter-spacing:-.035em}
    .oushadhi-logo__pos{font-family:Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.12em;color:#526b59}
    *{box-sizing:border-box}
    html,body{margin:0!important;padding:0!important;width:100%;max-width:${layout.paper}mm;min-height:0!important;background:#fff;color:#000;font-family:${appearance.fontFamily};overflow:visible}
    .thermal-receipt{display:block!important;position:static!important;width:${layout.content}mm;max-width:100%;height:auto!important;min-height:0!important;margin:0;padding:0 2mm;font-size:11px;line-height:1.35;overflow:visible;break-after:avoid;page-break-after:avoid;-webkit-text-stroke:${appearance.textStroke}px #000;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .receipt-logo{filter:url(#receipt-logo-print-ink);print-color-adjust:exact;-webkit-print-color-adjust:exact;display:block;width:${layout.logo}mm;max-width:100%;height:17mm;object-fit:${layout.paper === 58 ? "contain" : "cover"};object-position:center;margin:0 auto 0.5mm}
    .receipt-center{text-align:center;overflow-wrap:anywhere}
    footer.receipt-center{break-inside:avoid;page-break-inside:avoid}
    .receipt-cut-space{display:flex!important;align-items:flex-end;justify-content:center;height:10mm!important;min-height:10mm!important;flex:none;break-inside:avoid;page-break-inside:avoid}
    .receipt-end-mark{display:block;width:4mm;border-bottom:0.25mm solid #000}
    .receipt-center h1{font-size:18px;line-height:1.1;margin:0}
    .receipt-center p{margin:1px 0}
    .receipt-center small{display:block;margin-top:5px}
    .receipt-rule{border-top:1px dashed #000;margin:8px 0}
    .receipt-meta,.receipt-totals{margin:0}
    .receipt-meta div,.receipt-totals div,.receipt-item div{display:flex;justify-content:space-between;gap:8px}
    .receipt-meta dt,.receipt-totals dt{font-weight:400;flex:0 0 auto}
    .receipt-meta dd,.receipt-totals dd{margin:0;min-width:0;flex:1;text-align:right;font-weight:700;overflow-wrap:anywhere}
    .receipt-item{margin:0 0 7px;break-inside:avoid}
    .receipt-item strong{display:block;margin-bottom:1px}
    .receipt-item span{min-width:0;flex:1;max-width:50mm;overflow-wrap:anywhere}
    .receipt-item b{flex:0 0 auto;white-space:nowrap}
    .receipt-grand{font-size:14px;font-weight:700;border-top:1px solid #000;margin-top:5px;padding-top:5px}
    @page{size:auto;margin:0}
  </style></head><body>
    <svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
      <filter id="receipt-logo-print-ink" color-interpolation-filters="sRGB">
        <!-- Convert luminance to black ink; white backgrounds remain clear. -->
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0"/>
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0 0"/><feFuncG type="discrete" tableValues="0 0"/>
          <feFuncB type="discrete" tableValues="0 0"/><feFuncA type="discrete" tableValues="0 1"/>
        </feComponentTransfer>
        <feMorphology operator="dilate" radius="${appearance.logoSpread}"/>
      </filter>
    </defs></svg>${html}</body></html>`;
}
