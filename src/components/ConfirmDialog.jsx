"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";

const variants = {
  default: { icon: Info, iconClass: "bg-[var(--green-soft)] text-[var(--green)]", buttonClass: "btn-primary" },
  info: { icon: Info, iconClass: "bg-blue-50 text-blue-700", buttonClass: "btn-primary" },
  success: { icon: CircleCheck, iconClass: "bg-emerald-50 text-emerald-700", buttonClass: "btn-primary" },
  warning: { icon: TriangleAlert, iconClass: "bg-amber-50 text-amber-700", buttonClass: "btn-danger" },
  danger: { icon: CircleAlert, iconClass: "bg-red-50 text-[var(--red)]", buttonClass: "btn-danger" },
};

export function ConfirmDialog({ open, title, description, confirmText = "Confirm", cancelText = "Cancel", variant = "default", loading = false, disabled = false, loadingText, onConfirm, onCancel }) {
  const titleId = useId(), descriptionId = useId(), dialogRef = useRef(null), previousFocus = useRef(null);
  const style = variants[variant] || variants.default;
  const Icon = style.icon;
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector("button")?.focus(), 0);
    const keydown = (event) => {
      if (event.key === "Escape" && !loading && !disabled) { event.preventDefault(); onCancel?.(); return; }
      if (event.key === "Enter" && !loading && !disabled) { event.preventDefault(); onConfirm?.(); return; }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled])') || [])];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener("keydown", keydown); document.body.style.overflow = originalOverflow; previousFocus.current?.focus?.(); };
  }, [disabled, loading, onCancel, onConfirm, open]);
  if (!open) return null;
  return <div className="confirm-backdrop fixed inset-0 z-[300] grid place-items-center bg-black/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && !loading && !disabled && onCancel?.()}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="confirm-surface w-[calc(100vw-24px)] max-w-md rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start gap-3.5"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${style.iconClass}`}><Icon size={19} /></span><div className="min-w-0"><h2 id={titleId} className="text-lg font-extrabold leading-6 text-[var(--ink)]">{title}</h2><p id={descriptionId} className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p></div></div><footer className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 sm:min-w-24" disabled={loading || disabled} onClick={onCancel}>{cancelText}</button><button type="button" className={`btn min-h-11 sm:min-w-28 ${style.buttonClass}`} disabled={loading || disabled} onClick={onConfirm}>{loading && <LoaderCircle className="loading-shimmer-icon" size={16} />}{loading ? loadingText || `${confirmText}…` : confirmText}</button></footer></section></div>;
}

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    setRequest((current) => { current?.resolve(false); return { ...options, resolve }; });
  }), []);
  const finish = useCallback((accepted) => {
    setRequest((current) => { current?.resolve(accepted); return null; });
  }, []);
  return <ConfirmContext.Provider value={confirm}>{children}<ConfirmDialog open={Boolean(request)} title={request?.title || "Are you sure?"} description={request?.description || "Please confirm this action."} confirmText={request?.confirmText || "Confirm"} cancelText={request?.cancelText || "Cancel"} variant={request?.variant || "default"} onConfirm={() => finish(true)} onCancel={() => finish(false)} /></ConfirmContext.Provider>;
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
