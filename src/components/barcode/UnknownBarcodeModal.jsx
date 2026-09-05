"use client";

import Link from "next/link";
import { Barcode, Plus } from "lucide-react";

export default function UnknownBarcodeModal({ barcode, onClose, onScanAgain }) {
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-black/45 p-4" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><section className="card w-full max-w-md p-6 text-center" role="dialog" aria-modal="true"><span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700"><Barcode/></span><h2 className="mt-4 text-xl font-extrabold">Barcode not registered</h2><p className="mt-2 font-mono text-sm font-bold">{barcode}</p><p className="mt-2 text-sm text-[var(--muted)]">No product is currently assigned to this barcode.</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><Link className="btn btn-primary" href={`/products?newBarcode=${encodeURIComponent(barcode)}`}><Plus size={16}/>Add New Product</Link><button type="button" className="btn" onClick={onScanAgain}><Barcode size={16}/>Scan Again</button></div><button type="button" className="mt-4 text-sm font-bold text-[var(--muted)]" onClick={onClose}>Close</button></section></div>;
}
