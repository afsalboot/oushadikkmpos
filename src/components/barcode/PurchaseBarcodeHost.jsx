"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "lucide-react";
import { toast } from "sonner";
import BarcodeScannerListener from "@/components/barcode/BarcodeScannerListener";
import CameraBarcodeScanner from "@/components/barcode/CameraBarcodeScanner";
import ScannerStatus from "@/components/barcode/ScannerStatus";
import { looksLikeBarcode, normalizeBarcode } from "@/lib/barcode";

export default function PurchaseBarcodeHost() {
  const [target, setTarget] = useState(null), [cameraOpen, setCameraOpen] = useState(false), [status, setStatus] = useState({ status: "ready", message: "" });
  const scanning = useRef(false);
  const scan = useCallback(async (rawBarcode) => {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode || scanning.current) return;
    scanning.current = true;
    setStatus({ status: "scanning", message: "Scanning…" });
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}?context=purchase`), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Barcode not registered");
      window.dispatchEvent(new CustomEvent("oushadi-purchase-barcode-product", { detail: result.data }));
      setCameraOpen(false);
      setStatus({ status: "found", message: `${result.data.name} added` });
      toast.success(`${result.data.name} added to purchase`);
      window.setTimeout(() => setStatus({ status: "ready", message: "" }), 1600);
    } catch (error) {
      setCameraOpen(false);
      setStatus({ status: "error", message: error.message });
      toast.error(error.message);
      window.setTimeout(() => setStatus({ status: "ready", message: "" }), 2200);
    } finally { scanning.current = false; }
  }, []);

  useEffect(() => {
    let input, parent;
    const disconnect = () => {
      if (input?._purchaseBarcodeEnter) input.removeEventListener("keydown", input._purchaseBarcodeEnter);
      if (input) { delete input.dataset.barcodeInput; input.style.paddingRight = ""; }
      input = null; parent = null; setTarget(null);
    };
    const connect = () => {
      const candidate = [...document.querySelectorAll("input")].find((element) => element.placeholder?.toLowerCase().includes("search product, sku or scan barcode"));
      if (!candidate) return disconnect();
      if (candidate === input) return;
      disconnect(); input = candidate; parent = input.parentElement;
      input.dataset.barcodeInput = "true"; input.style.paddingRight = "7rem";
      const enter = (event) => { if (event.key === "Enter" && !event.defaultPrevented && looksLikeBarcode(input.value)) { event.preventDefault(); scan(input.value); } };
      input._purchaseBarcodeEnter = enter; input.addEventListener("keydown", enter); setTarget(parent);
    };
    connect();
    const observer = new MutationObserver(connect); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); disconnect(); };
  }, [scan]);

  return <><BarcodeScannerListener enabled={Boolean(target)&&!cameraOpen} allowInModal onScan={scan}/>{target&&createPortal(<><button type="button" className="btn absolute right-0 top-0 !min-h-11" onClick={()=>setCameraOpen(true)}><Barcode size={17}/>Scan</button>{status.status!=="ready"&&<span className="absolute -bottom-5 left-0"><ScannerStatus status={status.status} message={status.message}/></span>}</>,target)}{cameraOpen&&<CameraBarcodeScanner onDetected={scan} onClose={()=>setCameraOpen(false)}/>}</>;
}
