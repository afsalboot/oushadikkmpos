import "./globals.css";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import NumberInputDefaults from "@/components/NumberInputDefaults";
import ModalTooltipEnhancer from "@/components/ModalTooltipEnhancer";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import PurchaseBarcodeHost from "@/components/barcode/PurchaseBarcodeHost";

const oushadhiDisplay = localFont({
  src: "../../public/fonts/UncialAntiqua-Regular.ttf",
  weight: "400",
  variable: "--font-oushadhi",
  display: "swap",
});

export const metadata = {
  title: "Oushadhi POS",
  description: "Point of sale and inventory management for Ayurvedic retail",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={oushadhiDisplay.variable}>
        <NumberInputDefaults />
        <ModalTooltipEnhancer />
        <PurchaseBarcodeHost />
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
