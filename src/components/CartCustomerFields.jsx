"use client";

import { useEffect, useState } from "react";
import { GST_STATES } from "@/lib/gst-states";

export default function CartCustomerFields({ value, onChange, wholesale }) {
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const directory = wholesale ? "WHOLESALE" : "RETAIL";
  const selected = value.selected && (value.selected.customerType === "WHOLESALE") === wholesale
    ? value.selected : null;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResults([]);
      setError("");
      if (selected) return;
      const terms = [...new Set([value.name, value.phone].map((v) => (v || "").trim()).filter((v) => v.length >= 2))];
      try {
        const groups = await Promise.all(terms.map(async (term) => {
          const response = await fetch(`/api/customers/search?q=${encodeURIComponent(term)}&customerType=${directory}&limit=50`, { signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not search customers");
          return result.data;
        }));
        if (!controller.signal.aborted) setResults([...new Map(groups.flat().map((row) => [row._id, row])).values()]);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value.name, value.phone, selected, directory]);
  const update = (field, next) => {
    const formatted = ["name", "doctorName"].includes(field)
      ? next.replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase())
      : next;
    onChange({ ...value, [field]: formatted, ...(["name", "phone"].includes(field) ? { selected: null } : {}) });
  };
  return (
    <div id="cart-customer-fields" className="cart-customer-compact" onInvalidCapture={(event) => { const details = event.target.closest("details"); if (details) details.open = true; }}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]"><span className="font-bold">Customer · {wholesale ? "Wholesale" : "Retail"}</span><span>{selected ? "Linked customer" : "Optional"}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="sr-only">Customer name</span><input className="field" value={value.name || ""} onChange={(e) => update("name", e.target.value)} placeholder="Customer name" autoComplete="off" /></label>
        <label><span className="sr-only">Phone number</span><input className="field" type="tel" value={value.phone || ""} onChange={(e) => update("phone", e.target.value)} pattern="[0-9+ ()-]{7,18}" title="Enter a valid phone number" placeholder="Phone number" autoComplete="off" /></label>
      </div>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      {!selected && results.length > 0 && <div className="max-h-32 overflow-auto">{results.filter((customer) => (customer.customerType === "WHOLESALE") === wholesale).map((customer) => <button type="button" className="block w-full rounded border p-2 text-left text-sm" key={customer._id} onClick={() => onChange({ ...value, name: customer.name, phone: customer.phone || "", selected: customer })}><strong>{customer.name}</strong> · {customer.phone || "No phone"}</button>)}</div>}
      <details className="mt-1">
      <summary className="cursor-pointer py-1 text-xs font-semibold text-[var(--green)]">Doctor & fulfilment{value.fulfilment === "DELIVERY" ? " · Delivery" : ""}{value.doctorName ? " · Doctor added" : ""}</summary>
      <div className="space-y-2 pt-1">
      <label className="block"><span className="label">Doctor name</span><input className="field" maxLength={120} value={value.doctorName || ""} onChange={(e) => update("doctorName", e.target.value)} placeholder="Enter prescribing doctor name" /></label>
      <label className="block"><span className="label">Fulfilment</span><select className="field" value={value.fulfilment || "COUNTER"} onChange={(e) => update("fulfilment", e.target.value)}><option value="COUNTER">Counter sale</option><option value="DELIVERY">Delivery of goods</option></select></label>
      {value.fulfilment === "DELIVERY" && <>
        <label className="block"><span className="label">Delivery address</span><textarea className="field" required value={value.deliveryAddress || ""} onChange={(e) => update("deliveryAddress", e.target.value)} /></label>
        <label className="block"><span className="label">Delivery state</span><select className="field" required value={value.deliveryStateCode || ""} onChange={(e) => update("deliveryStateCode", e.target.value)}><option value="">Select state</option>{GST_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      </>}
      </div>
      </details>
    </div>
  );
}
