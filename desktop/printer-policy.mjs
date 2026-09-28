export function resolveReceiptPrinter(printers, savedName) {
  // An explicitly selected printer must never silently switch to another device.
  if (savedName) return printers.find((printer) => printer.name === savedName) || null;
  return printers.find((printer) => printer.isDefault) || null;
}
