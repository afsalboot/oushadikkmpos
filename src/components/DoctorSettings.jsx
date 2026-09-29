"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
const blank = { name: "", qualification: "", consultationFee: "", active: true };
export default function DoctorSettings() {
  const [data, setData] = useState(null), [form, setForm] = useState(blank), [editing, setEditing] = useState(null), [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function load() { try { const response = await fetch("/api/doctors", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result.data); } catch (e) { setError(e.message); } }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/doctors", { cache: "no-store", signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result.data; }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  async function save(event) {
    event.preventDefault(); if (saving) return; setSaving(true);
    try { const response = await fetch(editing ? `/api/doctors/${editing}` : "/api/doctors", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setForm(blank); setEditing(null); await load(); toast.success("Doctor saved"); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  if (error) return <p className="card p-5" role="alert">{error}</p>;
  if (!data) return <p>Loading doctors…</p>;
  return <div className="space-y-5">
    <p className="text-sm text-[var(--muted)]">Doctors are reception configuration only. Historical tickets keep their original doctor details.</p>
    {data.canManage && <form className="card space-y-4 p-5" onSubmit={save}><h3 className="font-bold">{editing ? "Edit doctor" : "Add doctor"}</h3><fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
      <label><span className="label">Doctor name *</span><input className="field" required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label><span className="label">Qualification</span><input className="field" maxLength={120} value={form.qualification} onChange={e => setForm({ ...form, qualification: e.target.value })} /></label>
      <label><span className="label">Consultation fee *</span><input className="field" type="number" min="0" max="99999999" step="0.01" required value={form.consultationFee} onChange={e => setForm({ ...form, consultationFee: e.target.value })} /></label>
      <label><span className="label">Status</span><select className="field" value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save doctor"}</button>{editing && <button className="btn" type="button" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}</div>
    </fieldset></form>}
    <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Doctor", "Qualification", "Fee", "Status", "Actions"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr className="border-t" key={row._id}><td className="p-3">{row.name}</td><td className="p-3">{row.qualification || "—"}</td><td className="p-3">₹{row.consultationFee}</td><td className="p-3">{row.active ? "Active" : "Inactive"}</td><td className="p-3">{data.canManage && <button className="btn" onClick={() => { setEditing(row._id); setForm({ name: row.name, qualification: row.qualification, consultationFee: row.consultationFee, active: row.active }); }}>Edit / Change status</button>}</td></tr>)}</tbody></table>{!data.rows.length && <p className="p-5">No doctors configured.</p>}</div>
  </div>;
}
