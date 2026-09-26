# Oushadhi receipt design

Open receipt.html in a browser to view the design. It is self-contained, including the logo. The displayed items are design examples only; this file does not connect to a database or create a sale.

For plain HTML projects, reuse receipt.html markup and receipt.css and replace the example values with your saved invoice data. Escape dynamic text when rendering. The preview has inline CSS; receipt.css is an identical separate copy for integration.

For React/Next.js projects:
1. Copy components/ThermalReceiptPrinter.jsx and components/gst-states.js into your components folder together.
2. Copy the contents of public into the application's public folder.
3. Dependencies: react, react-dom and lucide-react.
4. Import ReceiptPrintButton from the copied component and pass the saved sale: <ReceiptPrintButton sale={sale} />.
5. The button includes its own isolated print styling. For an on-screen preview, render <ThermalReceipt sale={sale} /> with receipt.css scoped to a separate page or iframe because its body styles are intended for receipts.

Pass final saved invoice values, including items and totals. The component displays values; it does not calculate tax or save payments. Optional fields support discounts, rounding, balances, customer details and saved GST fields.

Design: 80mm paper, 72mm content container, solid-black logo filter, compact address, right-aligned amounts, Malayalam thanks, and 10mm bottom space ending in a small printed mark. Preserve the SVG filter with the logo. Printer feed/cut settings can affect physical spacing.

This package contains the receipt design. Silent printing still requires the separate direct-print launcher configuration. No printing is triggered just by opening the preview.
