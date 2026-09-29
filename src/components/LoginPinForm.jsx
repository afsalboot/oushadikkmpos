"use client";
import { useState } from "react";
import { toast } from "sonner";
import PasswordInput from "@/components/PasswordInput";

export default function LoginPinForm({ enabled }) {
  const [active, setActive] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form)), remove };
    setSaving(true);
    try {
      const response = await fetch("/api/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save PIN");
      setActive(!remove);
      setRemove(false);
      form.reset();
      toast.success(remove ? "Login PIN removed" : "Login PIN saved");
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  }
  return <section className="card mx-auto w-full max-w-lg p-6">
    <h1 className="text-2xl font-extrabold">Login PIN</h1>
    <p className="mt-2 text-sm text-[var(--muted)]">{active ? "Your PIN is enabled. Change or remove it below." : "Set a four-digit PIN to sign in quickly with your username."} Your password remains available.</p>
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <fieldset disabled={saving} className="space-y-4">
        <label><span className="label">Current password</span><PasswordInput className="field" name="currentPassword" autoComplete="current-password" required /></label>
        {active && <label className="flex items-center gap-2"><input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />Remove my login PIN</label>}
        {!remove && <>
          <label><span className="label">New 4-digit PIN</span><PasswordInput className="field" name="pin" visibilityLabel="PIN" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" required /></label>
          <label><span className="label">Confirm PIN</span><PasswordInput className="field" name="confirmPin" visibilityLabel="confirm PIN" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" required /></label>
        </>}
        <p className="text-sm text-[var(--muted)]">Five failed PIN attempts lock PIN login until you sign in with your password. Password changes remove your PIN. Saving here signs out your other sessions.</p>
        <button className="btn btn-primary w-full" disabled={saving}>{saving ? "Saving…" : remove ? "Remove PIN" : "Save PIN"}</button>
      </fieldset>
    </form>
  </section>;
}
