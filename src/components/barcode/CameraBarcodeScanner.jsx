"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, RefreshCw, X } from "lucide-react";

export default function CameraBarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null), controlsRef = useRef(null), lockedRef = useRef(false);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [devices, setDevices] = useState([]), [deviceId, setDeviceId] = useState(""), [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    async function start() {
      setLoading(true);
      setError("");
      lockedRef.current = false;
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }, audio: false };
        controlsRef.current = await reader.decodeFromConstraints(constraints, video, (result) => {
          if (!result || lockedRef.current || !active) return;
          lockedRef.current = true;
          controlsRef.current?.stop();
          onDetected(result.getText());
        });
        const cameras = await BrowserMultiFormatReader.listVideoInputDevices();
        if (active) setDevices(cameras);
      } catch (failure) {
        if (!active) return;
        const denied = failure?.name === "NotAllowedError" || failure?.name === "SecurityError";
        setError(denied ? "Allow camera permission in your browser to scan product barcodes." : "Unable to access camera. Check that a camera is connected and try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      const stream = video?.srcObject;
      stream?.getTracks?.().forEach((track) => track.stop());
    };
  }, [deviceId, onDetected, retry]);

  return <div className="fixed inset-0 z-[160] grid place-items-end bg-black/55 p-0 sm:place-items-center sm:p-4" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><section className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="camera-scanner-title"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--green)]">Camera scanner</p><h2 id="camera-scanner-title" className="mt-1 text-xl font-extrabold">Scan Barcode</h2></div><button type="button" className="grid size-10 place-items-center rounded-full hover:bg-slate-100" onClick={onClose} aria-label="Close camera scanner"><X size={20}/></button></header><div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-[#10251a]"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline/><div className="pointer-events-none absolute inset-[18%_10%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.24)]"/><span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white">Align barcode inside the frame</span>{loading&&<div className="absolute inset-0 grid place-items-center bg-[#10251a] text-white"><span className="text-center"><LoaderCircle className="mx-auto loading-shimmer-icon"/><small className="mt-2 block">Starting camera…</small></span></div>}{error&&<div className="absolute inset-0 grid place-items-center bg-[#10251a] p-6 text-center text-white"><div><Camera className="mx-auto"/><strong className="mt-3 block">Camera access required</strong><p className="mt-2 text-sm text-white/75">{error}</p></div></div>}</div>{devices.length>1&&<label className="mt-4 block"><span className="label">Camera</span><select className="field" value={deviceId} onChange={(event)=>setDeviceId(event.target.value)}><option value="">Automatic rear camera</option>{devices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label||`Camera ${index+1}`}</option>)}</select></label>}<footer className="mt-4 flex justify-end gap-2">{error&&<button type="button" className="btn" onClick={()=>setRetry((value)=>value+1)}><RefreshCw size={16}/>Try Again</button>}<button type="button" className="btn" onClick={onClose}>Cancel</button></footer></section></div>;
}
