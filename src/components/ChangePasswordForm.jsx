"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change password");
      toast.success("Password changed successfully.");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f3f6f1] p-4"><form className="card w-full max-w-md p-6" onSubmit={submit}><span className="grid size-11 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><KeyRound size={20} /></span><h1 className="mt-4 text-2xl font-extrabold">Change your password</h1><p className="mt-2 text-sm text-[var(--muted)]">Your password was reset by an administrator. Set a private password before continuing.</p><div className="mt-6 space-y-4"><label><span className="label">Current temporary password</span><input className="field" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></label><label><span className="label">New password</span><input className="field" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label><span className="label">Confirm new password</span><input className="field" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label></div><button className="btn btn-primary mt-6 w-full" disabled={saving}>{saving ? <LoaderCircle className="loading-shimmer-icon" size={17} /> : <KeyRound size={17} />}{saving ? "Changing password…" : "Change password"}</button></form></main>;
}
