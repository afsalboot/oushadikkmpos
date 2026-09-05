"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "lucide-react";
import { toast } from "sonner";
import BarcodeScannerListener from "@/components/barcode/BarcodeScannerListener";
import CameraBarcodeScanner from "@/components/barcode/CameraBarcodeScanner";
import ScannerStatus from "@/components/barcode/ScannerStatus";
import UnknownBarcodeModal from "@/components/barcode/UnknownBarcodeModal";
import { looksLikeBarcode, normalizeBarcode } from "@/lib/barcode";

export default function SalesBarcodeHost() {
  const [target, setTarget] = useState(null), [cameraOpen, setCameraOpen] = useState(false), [status, setStatus] = useState({ status: "ready", message: "" }), [unknown, setUnknown] = useState("");
  const scanning = useRef(false);
  const scan = useCallback(async (rawBarcode) => {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode || scanning.current) return;
    scanning.current = true;
    setStatus({ status: "scanning", message: "Scanning…" });
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}?context=sale`), result = await response.json();
      if (!response.ok) {
        if (response.status === 404) setUnknown(barcode);
        throw new Error(result.error || "Unable to scan barcode. Please try again.");
      }
      window.dispatchEvent(new CustomEvent("oushadi-barcode-product", { detail: result.data }));
      setCameraOpen(false);
      setStatus({ status: "found", message: `${result.data.name} found` });
      window.setTimeout(() => setStatus({ status: "ready", message: "" }), 1600);
    } catch (error) {
      setCameraOpen(false);
      setStatus({ status: "error", message: error.message });
      toast.error(error.message);
      window.setTimeout(() => setStatus({ status: "ready", message: "" }), 2200);
    } finally { scanning.current = false; }
  }, []);

  useEffect(() => {
    let input, parent, headerButton;
    const connect = () => {
      input = document.querySelector("#pos-search");
      if (!input) return;
      parent = input.parentElement;
      input.dataset.barcodeInput = "true";
      input.placeholder = "Search product, SKU or barcode...";
      input.style.paddingRight = "7rem";
      setTarget(parent);
      const enter = (event) => { if (event.key === "Enter" && !event.defaultPrevented && looksLikeBarcode(input.value)) { event.preventDefault(); scan(input.value); } };
      input.addEventListener("keydown", enter);
      input._barcodeEnter = enter;
      headerButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Scan barcode");
      const openCamera = (event) => { event.preventDefault(); event.stopImmediatePropagation(); setCameraOpen(true); };
      headerButton?.addEventListener("click", openCamera, true);
      if (headerButton) headerButton._barcodeCamera = openCamera;
    };
    connect();
    const observer = new MutationObserver(() => { if (!document.querySelector("#pos-search")?._barcodeEnter) connect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (input) { input.removeEventListener("keydown", input._barcodeEnter); delete input.dataset.barcodeInput; input.style.paddingRight = ""; }
      if (headerButton?._barcodeCamera) headerButton.removeEventListener("click", headerButton._barcodeCamera, true);
    };
  }, [scan]);

  return <><BarcodeScannerListener enabled={!cameraOpen} onScan={scan}/>{target&&createPortal(<><button type="button" className="btn absolute right-0 top-0 !min-h-11" onClick={()=>setCameraOpen(true)}><Barcode size={17}/>Scan</button>{status.status!=="ready"&&<span className="absolute -bottom-5 left-0"><ScannerStatus status={status.status} message={status.message}/></span>}</>,target)}{cameraOpen&&<CameraBarcodeScanner onDetected={scan} onClose={()=>setCameraOpen(false)}/>} {unknown&&<UnknownBarcodeModal barcode={unknown} onClose={()=>setUnknown("")} onScanAgain={()=>{setUnknown("");setCameraOpen(true);}}/>}</>;
}
