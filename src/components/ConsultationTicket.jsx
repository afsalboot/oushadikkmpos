"use client";
/* Plain images are required because this markup is copied to the isolated print frame. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { printThermalReceipt } from "@/components/ThermalReceiptPrinter";
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value || 0);
export function ConsultationTicket({ record, receipt = record.receiptSnapshot || {}, includeFee = false, printedAt }) {
  const store = record.storeSnapshot || {};
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(printedAt);
  const rows = [["Doctor", `${record.doctorSnapshot.name} ${record.doctorSnapshot.qualification || ""}`], ["Patient", record.patient.name], ...(record.patient.phone ? [["Phone", record.patient.phone]] : []), ...(record.patient.age != null ? [["Age", record.patient.age]] : []), ...(record.patient.gender ? [["Gender", record.patient.gender]] : []), ["Date / Time", date], ...(receipt.showCashier !== false ? [["Reception", record.creatorSnapshot?.name || "Staff"]] : [])];
  return <div className="thermal-receipt" data-receipt-width={receipt.width || "80mm"}>
    <header className="receipt-center"><h1>{store.name || "Oushadi"}</h1>{receipt.showAddress !== false && <p>{store.address}</p>}{receipt.showPhone !== false && <p>{store.phone}</p>}{receipt.showLogo && store.logoUrl && <img className="receipt-logo" src={store.logoUrl} alt={store.name || "Store"} />}</header>
    <div className="receipt-rule" /><div className="receipt-center"><h1>TOKEN {record.tokenNumber}</h1><p>OP CONSULTATION</p>{record.status === "CANCELLED" && <p><b>CANCELLED · Refunded {money(record.refundedAmount)}</b></p>}</div><div className="receipt-rule" />
    <dl className="receipt-meta">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {includeFee && <><div className="receipt-rule" /><dl className="receipt-totals"><div className="receipt-grand"><dt>Consultation Fee</dt><dd>{money(record.consultationFee)}</dd></div></dl></>}
    <div className="receipt-rule" /><footer className="receipt-center"><h1>TOKEN {record.tokenNumber}</h1>{receipt.footerLine1 && <p>{receipt.footerLine1}</p>}{receipt.footerLine2 && <p>{receipt.footerLine2}</p>}<div className="receipt-cut-space" aria-hidden="true"><span className="receipt-end-mark" /></div></footer>
  </div>;
}
export default function ConsultationPrintButton({ record, receipt, autoPrint = false }) {
  const source = useRef(null), started = useRef(false), [printing, setPrinting] = useState(autoPrint);
  const [includeFee, setIncludeFee] = useState(false);
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => { if (!printing || !source.current || started.current) return; started.current = true; printThermalReceipt(source.current, () => { started.current = false; setPrinting(false); }); }, [printing]);
  return <><label className="flex w-full items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--green)]" checked={includeFee} disabled={printing} onChange={event => setIncludeFee(event.target.checked)} />Include consultation fee in print</label><button type="button" className="btn" disabled={printing} onClick={() => { setPrintedAt(new Date()); setPrinting(true); }}><Printer size={16} />{printing ? "Preparing…" : "Print Ticket"}</button>{printing && <div className="hidden" ref={source} aria-hidden="true"><ConsultationTicket record={record} receipt={receipt} includeFee={includeFee} printedAt={printedAt} /></div>}</>;
}
