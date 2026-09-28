import { BrowserWindow } from "electron";
import { resolveReceiptPrinter } from "./printer-policy.mjs";

export async function printReceipt(html, origin, savedPrinterName = "") {
  if (typeof html !== "string" || html.length > 2_000_000 || !html.includes('class="thermal-receipt"')) {
    throw new Error("Invalid receipt document.");
  }
  const printWindow = new BrowserWindow({
    show: false,
    width: 303,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    const contents = printWindow.webContents;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    const printers = await contents.getPrintersAsync();
    const printer = resolveReceiptPrinter(printers, savedPrinterName);
    if (!printer) throw new Error(printers.length === 0
      ? "Windows reports no installed printers. Connect your printer and install its Windows driver, then choose POS > Select Receipt Printer."
      : savedPrinterName
        ? `The saved printer (${savedPrinterName}) is unavailable. Connect it or choose POS > Select Receipt Printer.`
        : "Choose POS > Select Receipt Printer to select your receipt printer. Any installed printer name is supported.");
    const policy = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${origin} data:; font-src ${origin}; base-uri ${origin}; form-action 'none'; frame-src 'none'`;
    const document = `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${origin}/"></head>${html}`;
    await contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
    await contents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
    })()`);
    await new Promise((resolve, reject) => {
      contents.print({ silent: true, deviceName: printer.name, printBackground: true,
        usePrinterDefaultPageSize: true, margins: { marginType: "none" }, copies: 1 },
      (success, reason) => success ? resolve() : reject(new Error(reason || "The printer did not accept the receipt.")));
    });
    return { success: true };
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}
