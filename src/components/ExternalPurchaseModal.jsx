"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { buildExternalPurchase, EXTERNAL_PURCHASE_PAYMENTS } from "@/lib/external-purchase";

export default function ExternalPurchaseModal({ products, initial = {}, onClose, onSave }) {
  const [form, setForm] = useState({ name: initial.name || "", productId: initial.externalPurchaseId ? initial.productId || "" : initial.productId || initial._id || "",
    quantity: initial.quantity || 1, packageType: initial.packageType || "pcs",
    purchaseCost: initial.purchaseCost ?? "", unitPrice: initial.unitPrice ?? initial.packageSellingPrice ?? "",
    externalSupplierName: initial.externalSupplierName || "", externalPurchasePaymentMethod: initial.externalPurchasePaymentMethod || "CASH",
    externalPurchaseNotes: initial.externalPurchaseNotes || "", externalPurchaseId: initial.externalPurchaseId || crypto.randomUUID() });
  const field = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const units = [...new Set(["pcs", "bottle", "packet", "ml", "g", "kg", "tablet", "box", ...products.flatMap(product => [product.packageType, product.baseUnit, product.looseUnit]).filter(Boolean)])];
  const selected = products.find(product => String(product._id) === String(form.productId));
  function save(event) {
    event.preventDefault();
    try {
      const line = buildExternalPurchase(form, selected);
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
        <Dialog.Description className="mb-4 text-sm text-[var(--muted)]">Add a supplier-bought item to this bill. Your shop stock stays unchanged. Cost is per unit and stays internal.</Dialog.Description>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Select existing product (optional)</span>
            <select className="field" value={form.productId} onChange={event => {
              const product = products.find(entry => String(entry._id) === event.target.value);
              setForm(current => ({ ...current, productId: product?._id || "", ...(product ? { name: product.name, packageType: product.packageType || product.baseUnit, unitPrice: product.packageSellingPrice ?? "" } : {}) }));
            }}><option value="">Manual product</option>{form.productId && !selected && <option value={form.productId}>{form.name} (unavailable; select Manual product)</option>}{products.map(product => <option key={product._id} value={product._id}>{product.name} · {product.packageType} · {product.stockLabel || ""}</option>)}</select>
          </label>
          <label className="sm:col-span-2"><span className="label">Product Name *</span><input autoFocus className="field" required maxLength={160} value={form.name} onChange={event => field("name", event.target.value)} /></label>
          <label><span className="label">Quantity *</span><input className="field" type="number" required min="0.001" max="99999999" step="0.001" value={form.quantity} onChange={event => field("quantity", event.target.value)} /></label>
          <label><span className="label">Unit *</span><input className="field" list="external-purchase-units" required maxLength={40} value={form.packageType} onChange={event => field("packageType", event.target.value)} /><datalist id="external-purchase-units">{units.map(unit => <option key={unit} value={unit} />)}</datalist></label>
          <label><span className="label">Purchase Cost / unit *</span><input className="field" type="number" required min="0" max="99999999" step="0.01" value={form.purchaseCost} onChange={event => field("purchaseCost", event.target.value)} /></label>
          <label><span className="label">Selling Price / unit *</span><input className="field" type="number" required min="0" max="99999999" step="0.01" value={form.unitPrice} onChange={event => field("unitPrice", event.target.value)} /></label>
          <label><span className="label">Supplier / Shop</span><input className="field" maxLength={160} value={form.externalSupplierName} onChange={event => field("externalSupplierName", event.target.value)} /></label>
          <label><span className="label">Purchase Payment Method *</span><select className="field" required value={form.externalPurchasePaymentMethod} onChange={event => field("externalPurchasePaymentMethod", event.target.value)}>{Object.entries(EXTERNAL_PURCHASE_PAYMENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="label">Notes</span><textarea className="field" maxLength={1000} value={form.externalPurchaseNotes} onChange={event => field("externalPurchaseNotes", event.target.value)} /></label>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><Dialog.Close className="btn" type="button">Cancel</Dialog.Close><button className="btn btn-primary" type="submit">{initial.externalPurchaseId ? "Save changes" : "Add to Cart"}</button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
