"use client";

import { useEffect, useRef, useState } from "react";
import { ThermalReceipt, printThermalReceipt } from "@/components/ThermalReceiptPrinter";

export default function SalesSuccessHost() {
  const [sale, setSale] = useState(null);
  const sourceRef = useRef(null);
  const printedSaleRef = useRef(null);

  useEffect(() => {
    const printSale = (event) => setSale(event.detail?.sale || null);
    window.addEventListener("oushadi-sale-success", printSale);
    return () => window.removeEventListener("oushadi-sale-success", printSale);
  }, []);

  useEffect(() => {
    const saleId = sale?._id || sale?.invoiceNumber;
    if (!saleId || !sourceRef.current || printedSaleRef.current === saleId) return;
    printedSaleRef.current = saleId;
    printThermalReceipt(sourceRef.current, () => {
      setSale((current) => current === sale ? null : current);
    });
  }, [sale]);

  if (!sale) return null;
  return (
    <div ref={sourceRef} className="hidden" aria-hidden="true">
      <ThermalReceipt sale={sale} />
    </div>
  );
}
