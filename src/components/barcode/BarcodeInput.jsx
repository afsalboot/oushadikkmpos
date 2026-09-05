"use client";

import { useCallback, useState } from "react";
import { Camera, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import CameraBarcodeScanner from "@/components/barcode/CameraBarcodeScanner";
import { detectBarcodeType } from "@/lib/barcode";

export default function BarcodeInput({ value, onChange, barcodeType, onTypeChange, allowGenerate = false }) {
  const [cameraOpen, setCameraOpen] = useState(false), [generating, setGenerating] = useState(false);
  const detected = useCallback((barcode) => {
    onChange(barcode);
    onTypeChange?.(detectBarcodeType(barcode));
    setCameraOpen(false);
    toast.success("Barcode scanned");
  }, [onChange, onTypeChange]);
  async function generate() {
    if (value) return toast.error("Clear the existing barcode before generating another one.");
    setGenerating(true);
    try {
      const response = await fetch("/api/products/barcode/generate", { method: "POST" }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate barcode");
      onChange(result.data.barcode);
      onTypeChange?.("CODE128");
      toast.success("Internal barcode generated");
    } catch (error) { toast.error(error.message); }
    finally { setGenerating(false); }
  }
  return <><div className="flex gap-2"><input className="field min-w-0" data-barcode-input="true" placeholder="Scan or enter barcode" value={value || ""} onChange={(event)=>onChange(event.target.value.replace(/\s/g,""))} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();onChange(event.currentTarget.value.replace(/\s/g,""));toast.success("Barcode captured");}}}/><button type="button" className="btn shrink-0 !px-3" title="Scan with device camera" onClick={()=>setCameraOpen(true)}><Camera size={17}/><span className="hidden sm:inline">Scan</span></button>{allowGenerate&&<button type="button" className="btn shrink-0 !px-3" title="Generate a unique internal Code 128 barcode" disabled={generating} onClick={generate}>{generating?<LoaderCircle className="loading-shimmer-icon" size={17}/>:<Sparkles size={17}/>}<span className="hidden lg:inline">Generate</span></button>}</div>{barcodeType&&<select className="field mt-2 !min-h-9 text-xs" value={barcodeType} onChange={(event)=>onTypeChange?.(event.target.value)} aria-label="Barcode type">{["EAN13","EAN8","UPCA","UPCE","CODE128","CODE39","QR"].map((type)=><option key={type} value={type}>{type}</option>)}</select>}{cameraOpen&&<CameraBarcodeScanner onDetected={detected} onClose={()=>setCameraOpen(false)}/>}</>;
}
