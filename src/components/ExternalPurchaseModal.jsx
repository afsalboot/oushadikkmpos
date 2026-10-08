"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { buildExternalPurchase } from "@/lib/external-purchase";

export default function ExternalPurchaseModal({ products, initial = {}, onClose, onSave }) {
  const [form, setForm] = useState({ ...(initial.externalPurchaseId ? initial : {}), name: initial.name || "", productId: initial.productId || null,
    quantity: initial.quantity || 1, packageType: initial.packageType || "pcs",
    unitPrice: initial.unitPrice ?? initial.packageSellingPrice ?? "",
    externalPurchaseNotes: initial.externalPurchaseNotes || "", externalPurchaseId: initial.externalPurchaseId || crypto.randomUUID() });
  const field = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const units = [...new Set(["pcs", "bottle", "packet", "ml", "g", "kg", "tablet", "box", ...products.flatMap(product => [product.packageType, product.baseUnit, product.looseUnit]).filter(Boolean)])];
  function save(event) {
    event.preventDefault();
    try {
      const line = buildExternalPurchase(form);
      onSave({ ...line, productId: form.productId || null, packageSellingPrice: line.unitPrice,
        _id: initial.externalPurchaseId ? initial._id : `external-${line.externalPurchaseId}`, billedLineIndex: initial.billedLineIndex });
      onClose();
    } catch (error) { toast.error(error.message); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Dialog.Title className="text-xl font-extrabold">External Purchase</Dialog.Title>
          <Dialog.Close className="btn !min-h-8 !p-2" aria-label="Close External Purchase"><X size={18} /></Dialog.Close>
        </div>
        <Dialog.Description className="mb-4 text-sm text-[var(--muted)]">Enter an item and its selling price to add it to this bill. Your shop stock stays unchanged.</Dialog.Description>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Product Name *</span><input autoFocus className="field" required maxLength={160} value={form.name} onChange={event => field("name", event.target.value)} /></label>
          <label><span className="label">Quantity *</span><input className="field" type="number" required min="0.001" max="99999999" step="0.001" value={form.quantity} onChange={event => field("quantity", event.target.value)} /></label>
          <label><span className="label">Unit *</span><input className="field" list="external-purchase-units" required maxLength={40} value={form.packageType} onChange={event => field("packageType", event.target.value)} /><datalist id="external-purchase-units">{units.map(unit => <option key={unit} value={unit} />)}</datalist></label>
          <label><span className="label">Selling Price / unit *</span><input className="field" type="number" required min="0" max="99999999" step="0.01" value={form.unitPrice} onChange={event => field("unitPrice", event.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">Notes</span><textarea className="field" maxLength={1000} value={form.externalPurchaseNotes} onChange={event => field("externalPurchaseNotes", event.target.value)} /></label>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><Dialog.Close className="btn" type="button">Cancel</Dialog.Close><button className="btn btn-primary" type="submit">{initial.externalPurchaseId ? "Save changes" : "Add to Cart"}</button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
