"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { dashboardToday } from "@/lib/dashboard-dates";
import ConsultationPrintButton from "@/components/ConsultationTicket";
import ConsultationActions from "@/components/ConsultationActions";

const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value || 0);
const dateTime = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
async function api(url, options) { const response = await fetch(url, { cache: "no-store", ...options }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Request failed"); return result.data; }
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function Dialog({ title, children, close, busy = false }) {
  const ref = useRef(null);
  useEffect(() => { const element = ref.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={ref} aria-label={title} className="m-auto max-h-[90dvh] w-[min(95vw,620px)] overflow-auto rounded-2xl p-0 backdrop:bg-black/40" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><div className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-extrabold">{title}</h2><button type="button" className="btn" disabled={busy} onClick={close} aria-label="Close"><X size={18} /></button></div><div className="p-5">{children}</div></dialog>;
}
const blank = () => ({ patient: { name: "", phone: "", age: "", gender: "" }, doctorId: "", consultationFee: "", paymentMethod: "", paymentReference: "", customerId: "", requestId: crypto.randomUUID() });
export default function ConsultationWorkspace({ report = false }) {
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [deleteReason, setDeleteReason] = useState("");
  const [options, setOptions] = useState(null), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState({ from: dashboardToday(), to: dashboardToday(), search: "", doctor: "", paymentMethod: "", status: "", page: 1 });
  const [form, setForm] = useState(null), [saving, setSaving] = useState(false), [matches, setMatches] = useState([]), [looking, setLooking] = useState(false);
  const [detail, setDetail] = useState(null), [autoPrint, setAutoPrint] = useState(false), [cancel, setCancel] = useState(null), [reason, setReason] = useState(""), [refundConfirmed, setRefundConfirmed] = useState(false), [refundReference, setRefundReference] = useState("");
  useEffect(() => { let active = true; api("/api/consultations/options").then(value => { if (active) setOptions(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api(`/api/consultations?${new URLSearchParams(filters)}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setError(""); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, revision]);
  const capabilities = options?.capabilities || {};
  const changeFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  const patient = (key, value) => { setForm(current => ({ ...current, customerId: ["name", "phone"].includes(key) ? "" : current.customerId, patient: { ...current.patient, [key]: value } })); setMatches([]); };
  async function findCustomer() { setLooking(true); try { setMatches(await api(`/api/customers/search?q=${encodeURIComponent(form.patient.phone)}&limit=10`)); } catch (e) { toast.error(e.message); } finally { setLooking(false); } }
  async function create(event) {
    event.preventDefault(); if (saving) return; setSaving(true);
    try { const row = await api("/api/consultations", post(form)); setForm(null); setDetail(row); setAutoPrint(Boolean(options.receipt.autoPrint && capabilities.print)); setRevision(value => value + 1); toast.success("Consultation created"); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  async function view(row, print = false) { try { const current = await api(`/api/consultations/${row._id}`); setDetail(current); setAutoPrint(print); } catch (e) { toast.error(e.message); } }
  async function cancelRecord(event) {
    event.preventDefault(); if (saving) return; setSaving(true);
    try { await api(`/api/consultations/${cancel._id}/cancel`, post({ reason, refundConfirmed, refundReference })); setCancel(null); setDetail(null); setRevision(value => value + 1); toast.success("Consultation cancelled and refund recorded"); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  async function editRecord(row) {
    try {
      const current = await api(`/api/consultations/${row._id}`);
      setEditing({ ...current, patient: { name: "", phone: "", age: "", gender: "", ...current.patient } });
    } catch (e) { toast.error(e.message); }
  }
  async function saveUpdate(event) {
    event.preventDefault(); if (saving) return; setSaving(true);
    try {
      await api(`/api/consultations/${editing._id}`, { ...post({ patient: editing.patient, doctorId: editing.doctorId }), method: "PATCH" });
      setEditing(null); setRevision(value => value + 1); toast.success("Consultation updated");
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  async function deleteRecord(event) {
    event.preventDefault(); if (saving) return; setSaving(true);
    try {
      await api(`/api/consultations/${deleting._id}`, { ...post({ reason: deleteReason }), method: "DELETE" });
      setDeleting(null); changeFilter("page", 1); setRevision(value => value + 1); toast.success("Consultation deleted from the list");
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  return <div className="space-y-5">
    {editing && <Dialog title={`Update ${editing.opNumber}`} busy={saving} close={() => setEditing(null)}><form onSubmit={saveUpdate}><fieldset disabled={saving} className="space-y-4">
      <p className="text-sm text-[var(--muted)]">Update patient and doctor details. The collected fee, payment and ticket numbers stay unchanged.</p>
      <label className="block"><span className="label">Patient name *</span><input className="field" required maxLength={120} value={editing.patient.name} onChange={e => setEditing({ ...editing, patient: { ...editing.patient, name: e.target.value } })} /></label>
      <label className="block"><span className="label">Phone</span><input className="field" type="tel" maxLength={24} value={editing.patient.phone} onChange={e => setEditing({ ...editing, patient: { ...editing.patient, phone: e.target.value } })} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Age</span><input className="field" type="number" min="0" max="130" step="1" value={editing.patient.age ?? ""} onChange={e => setEditing({ ...editing, patient: { ...editing.patient, age: e.target.value } })} /></label>
      <label><span className="label">Gender</span><select className="field" value={editing.patient.gender} onChange={e => setEditing({ ...editing, patient: { ...editing.patient, gender: e.target.value } })}><option value="">Not specified</option><option>Male</option><option>Female</option><option>Other</option></select></label></div>
      <label className="block"><span className="label">Doctor *</span><select className="field" required value={editing.doctorId} onChange={e => setEditing({ ...editing, doctorId: e.target.value })}>{options.doctors.filter(doctor => doctor.active || doctor._id === editing.doctorId).map(doctor => <option key={doctor._id} value={doctor._id}>{doctor.name}{doctor.active ? "" : " (inactive)"}</option>)}</select></label>
      <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
    </fieldset></form></Dialog>}
    {deleting && <Dialog title={`Delete ${deleting.opNumber}`} busy={saving} close={() => setDeleting(null)}>{deleting.status !== "CANCELLED" ? <p>Cancel and refund this consultation using Cancel / Refund before deleting it.</p> : <form onSubmit={deleteRecord} className="space-y-4"><p>Remove this ticket from the consultation list? Payment, refund and audit history will be retained.</p><label className="block"><span className="label">Reason *</span><textarea className="field" required maxLength={500} value={deleteReason} disabled={saving} onChange={e => setDeleteReason(e.target.value)} /></label><button className="btn btn-danger" disabled={saving}>{saving ? "Deleting…" : "Delete consultation"}</button></form>}</Dialog>}
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-extrabold">{report ? "Consultation Report" : "Consultation"}</h1><p className="mt-1 text-sm text-[var(--muted)]">Reception registration and OP tickets</p></div><div className="flex flex-wrap gap-2"><Link className="btn" href={report ? "/consultations" : "/consultations/report"}>{report ? "Reception" : "Consultation report"}</Link><button className="btn" onClick={() => setRevision(value => value + 1)} aria-label="Refresh"><RefreshCw size={16} /></button>{!report && capabilities.create && <button className="btn btn-primary" onClick={() => { setForm({ ...blank(), paymentMethod: options.payments.enabledMethods[0] || "" }); setMatches([]); }}><Plus size={16} />New Consultation</button>}</div></header>
    <section className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p>Completed consultations</p><b className="text-2xl">{data?.summary.count ?? "—"}</b></div><div className="card p-4"><p>Consultation collection</p><b className="text-2xl">{data ? money(data.summary.collection) : "—"}</b></div><div className="card p-4"><p>Cancelled / refunded</p><b className="text-2xl">{data?.summary.cancelled ?? "—"}</b></div></section>
    <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label><span className="label">From</span><input className="field" type="date" value={filters.from} max={filters.to} onChange={e => changeFilter("from", e.target.value)} /></label><label><span className="label">To</span><input className="field" type="date" value={filters.to} min={filters.from} onChange={e => changeFilter("to", e.target.value)} /></label>
      <label><span className="label">Search</span><input className="field" placeholder="Patient, phone or OP number" value={filters.search} onChange={e => changeFilter("search", e.target.value)} /></label>
      <label><span className="label">Doctor</span><select className="field" value={filters.doctor} onChange={e => changeFilter("doctor", e.target.value)}><option value="">All doctors</option>{options?.doctors.map(row => <option key={row._id} value={row._id}>{row.name}{row.active ? "" : " (inactive)"}</option>)}</select></label>
      <label><span className="label">Payment</span><select className="field" value={filters.paymentMethod} onChange={e => changeFilter("paymentMethod", e.target.value)}><option value="">All methods</option>{["CASH", "UPI", "BANK"].map(method => <option key={method}>{method}</option>)}</select></label><label><span className="label">Status</span><select className="field" value={filters.status} onChange={e => changeFilter("status", e.target.value)}><option value="">All statuses</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
      <label><span className="label">Branch</span><select className="field" aria-label="Branch"><option>Main store</option></select></label>
    </section>
    {error && <p className="card border-red-200 p-4 text-red-700" role="alert">{error}</p>}
    <section className="card overflow-x-auto" aria-busy={loading}><table className="w-full whitespace-nowrap text-left text-sm"><thead><tr>{["Token", "OP Number", "Patient", "Phone", "Doctor", "Fee", "Payment", "Date / Time", "Status", "Created by", "Actions"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data?.rows.map(row => <tr className="border-t" key={row._id}><td className="p-3 font-bold">{row.tokenNumber}</td><td className="p-3">{row.opNumber}</td><td className="p-3">{row.patient.name}</td><td className="p-3">{row.patient.phone || "—"}</td><td className="p-3">{row.doctorSnapshot.name}</td><td className="p-3">{money(row.consultationFee)}</td><td className="p-3">{row.paymentMethod}</td><td className="p-3">{dateTime(row.createdAt)}</td><td className="p-3">{row.status}</td><td className="p-3">{row.creatorSnapshot?.name || "—"}</td><td className="p-3"><ConsultationActions row={row} capabilities={capabilities} onView={() => view(row)} onPrint={() => view(row, true)} onUpdate={() => editRecord(row)} onCancel={() => { setCancel(row); setReason(""); setRefundConfirmed(false); setRefundReference(""); }} onDelete={() => { setDeleting(row); setDeleteReason(""); }} /></td></tr>)}</tbody></table>{!data?.rows.length && <p className="p-8 text-center">{loading ? "Loading consultations…" : "No consultations in this period."}</p>}</section>
    {data && <div className="flex items-center justify-between"><span className="text-sm">{data.pagination.total} records · Page {data.pagination.page} of {data.pagination.pages}</span><div className="flex gap-2"><button className="btn" disabled={filters.page <= 1 || loading} onClick={() => changeFilter("page", filters.page - 1)}>Previous</button><button className="btn" disabled={filters.page >= data.pagination.pages || loading} onClick={() => changeFilter("page", filters.page + 1)}>Next</button></div></div>}
    {form && <Dialog title="New Consultation" busy={saving} close={() => setForm(null)}><form onSubmit={create}><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Patient name *</span><input autoFocus className="field" required maxLength={120} value={form.patient.name} onChange={e => patient("name", e.target.value)} /></label><label><span className="label">Phone</span><input className="field" type="tel" maxLength={24} value={form.patient.phone} onChange={e => patient("phone", e.target.value)} /></label></div>
      {capabilities.customers && <div><button type="button" className="btn" disabled={looking || form.patient.phone.length < 4} onClick={findCustomer}>{looking ? "Searching…" : "Find existing customer"}</button>{form.customerId && <span className="ml-2 text-sm">Customer linked</span>}{matches.map(row => <button key={row._id} type="button" className="mt-2 block w-full rounded-lg border p-3 text-left" onClick={() => { setForm(current => ({ ...current, customerId: row._id, patient: { ...current.patient, name: row.name, phone: row.phone || "" } })); setMatches([]); }}>{row.name} · {row.phone}</button>)}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Age</span><input className="field" type="number" min="0" max="130" step="1" value={form.patient.age} onChange={e => patient("age", e.target.value)} /></label><label><span className="label">Gender</span><select className="field" value={form.patient.gender} onChange={e => patient("gender", e.target.value)}><option value="">Not specified</option><option>Male</option><option>Female</option><option>Other</option></select></label>
      <label><span className="label">Doctor *</span><select className="field" required value={form.doctorId} onChange={e => { const doctor = options.doctors.find(row => row._id === e.target.value); setForm({ ...form, doctorId: e.target.value, consultationFee: doctor?.consultationFee ?? "" }); }}><option value="">Select doctor</option>{options.doctors.filter(row => row.active).map(row => <option key={row._id} value={row._id}>{row.name} {row.qualification}</option>)}</select></label><label><span className="label">Consultation fee *</span><input className="field" type="number" min="0" max="99999999" step="0.01" required readOnly={!capabilities.overrideFee} value={form.consultationFee} onChange={e => setForm({ ...form, consultationFee: e.target.value })} /></label>
      <label><span className="label">Payment method *</span><select className="field" required value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value, paymentReference: "" })}>{options.payments.enabledMethods.map(method => <option key={method}>{method}</option>)}</select></label><label><span className="label">Payment reference{options.payments.requireReference[form.paymentMethod] && Number(form.consultationFee) > 0 ? " *" : ""}</span><input className="field" required={options.payments.requireReference[form.paymentMethod] && Number(form.consultationFee) > 0} maxLength={120} value={form.paymentReference} onChange={e => setForm({ ...form, paymentReference: e.target.value })} /></label></div>
      {!options.doctors.some(row => row.active) && <p className="text-sm text-amber-800">Ask the owner to add an active doctor in Settings → Consultation.</p>}
      <button className="btn btn-primary w-full" disabled={saving || !form.doctorId}>{saving ? "Creating…" : `Collect ${money(form.consultationFee)} & create ticket`}</button>
    </fieldset></form></Dialog>}
    {detail && <Dialog title={detail.status === "CANCELLED" ? "Cancelled Consultation" : "Consultation Ticket"} close={() => setDetail(null)}><div className="space-y-4"><div className="rounded-xl bg-[var(--green-soft)] p-5 text-center"><p>Token</p><b className="text-4xl">{detail.tokenNumber}</b><p className="mt-2 font-bold">{detail.opNumber}</p></div><p><b>{detail.patient.name}</b> · {detail.patient.phone || "No phone"}</p><p>{detail.doctorSnapshot.name} {detail.doctorSnapshot.qualification}</p><p>{dateTime(detail.createdAt)}</p><p className="text-xl font-bold">{money(detail.consultationFee)} · {detail.paymentMethod}</p>{detail.status === "CANCELLED" && <p>Refunded {money(detail.refundedAmount)} · {detail.cancellationReason}</p>}<div className="flex flex-wrap gap-3">{capabilities.print && <ConsultationPrintButton key={detail._id} record={detail} receipt={options.receipt} autoPrint={autoPrint} />}<button className="btn" onClick={() => setDetail(null)}>Done</button></div></div></Dialog>}
    {cancel && <Dialog title={`Cancel ${cancel.opNumber}`} busy={saving} close={() => setCancel(null)}><form onSubmit={cancelRecord} className="space-y-4"><label><span className="label">Cancellation reason *</span><textarea className="field" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>{cancel.consultationFee > 0 && <label className="flex gap-3"><input type="checkbox" required checked={refundConfirmed} onChange={e => setRefundConfirmed(e.target.checked)} /><span>I have returned {money(cancel.consultationFee)} through {cancel.paymentMethod}. This records the refund; it does not send money.</span></label>}<label><span className="label">Refund reference</span><input className="field" maxLength={120} value={refundReference} onChange={e => setRefundReference(e.target.value)} /></label><button className="btn btn-danger" disabled={saving}>{saving ? "Cancelling…" : "Confirm cancellation"}</button></form></Dialog>}
  </div>;
}
