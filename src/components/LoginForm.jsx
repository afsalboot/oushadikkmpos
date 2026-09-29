"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import OushadhiLogo from "@/components/branding/OushadhiLogo";
import PasswordInput from "@/components/PasswordInput";
import { PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";
export default function LoginForm() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [setupUsername, setSetupUsername] = useState(false);
  const [pinLogin, setPinLogin] = useState(false);
  const usePin = pinLogin && !bootstrap && !setupUsername;
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(({ data }) => setBootstrap(data.needsBootstrap))
      .catch(() => toast.error("Could not connect to the application database"))
      .finally(() => setLoading(false));
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = Object.fromEntries(new FormData(e.currentTarget));
      if (!bootstrap && setupUsername) body.setupUsername = true;
      const response = await fetch(
        bootstrap ? "/api/auth/bootstrap" : usePin ? "/api/auth/pin-login" : "/api/auth/username-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok) return toast.error(result.error);
      toast.success(bootstrap ? "Admin account created" : "Welcome back");
      router.replace(result.data?.user?.mustChangePassword ? "/change-password" : "/dashboard");
      router.refresh();
    } catch {
      toast.error("Could not sign in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_.9fr] bg-white">
      <section className="hidden lg:flex relative overflow-hidden bg-[#173d29] text-white p-14 flex-col justify-between">
        <div className="absolute -right-20 top-20 size-80 rounded-full border border-white/10" />
        <div className="absolute -right-5 top-36 size-48 rounded-full border border-white/10" />
        <div className="relative">
          <OushadhiLogo tone="inverse" />
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-bold uppercase tracking-[.18em] text-emerald-200">
            Careful stock. Faster service.
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight">
            Every package, every loose sale, one reliable inventory.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-emerald-50/75">
            Built for Ayurvedic retail—with physical package stock that stays
            understandable at the counter.
          </p>
        </div>
        <p className="relative text-sm text-emerald-100/55">
          Secure access · Cash, UPI & split payments · Complete stock ledger
        </p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <OushadhiLogo />
          </div>
          {loading ? (
            <div className="grid min-h-80 place-items-center">
              <LoaderCircle className="loading-shimmer-icon text-[#1f6b45]" />
            </div>
          ) : (
            <>
              <div className="mb-8">
                <span className="pill mb-4">
                  <ShieldCheck size={14} />
                  {bootstrap ? "Secure setup" : "Secure sign in"}
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight">
                  {bootstrap ? "Create the first admin" : setupUsername ? "Set up your username" : "Welcome back"}
                </h2>
                <p className="mt-2 text-[var(--muted)]">
                  {bootstrap
                    ? "No account exists yet. Set up the store owner account."
                    : "Sign in to open the Oushadi workspace."}
                </p>
              </div>
              <form onSubmit={submit} className="space-y-5">
                {!bootstrap && !setupUsername && <div className="flex gap-2" aria-label="Sign-in method">
                  <button type="button" disabled={submitting} aria-pressed={!pinLogin} className={`btn flex-1 ${!pinLogin ? "btn-primary" : ""}`} onClick={() => setPinLogin(false)}>Password</button>
                  <button type="button" disabled={submitting} aria-pressed={pinLogin} className={`btn flex-1 ${pinLogin ? "btn-primary" : ""}`} onClick={() => setPinLogin(true)}>4-digit PIN</button>
                </div>}
                {bootstrap && (
                  <label>
                    <span className="label">Setup token</span>
                    <PasswordInput
                      className="field"
                      name="setupToken"
                      visibilityLabel="setup token"
                      autoComplete="off"
                      maxLength={512}
                    />
                    <span className="text-sm text-[var(--muted)]">
                      Use the setup token supplied by your deployment
                      administrator.
                    </span>
                  </label>
                )}
                {bootstrap && (
                  <label>
                    <span className="label">Full name</span>
                    <input
                      className="field"
                      name="name"
                      autoComplete="name"
                      required
                    />
                  </label>
                )}
                <label><span className="label">Username</span><input className="field" name="username" autoComplete="username" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" minLength={3} maxLength={32} autoCapitalize="none" spellCheck={false} required /></label>
                {(bootstrap || setupUsername) && <label>
                  <span className="label">Email address</span>
                  <input
                    className="field"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>}
                <label>
                  <span className="label">{usePin ? "4-digit PIN" : setupUsername && !bootstrap ? "Current password" : "Password"}</span>
                  <PasswordInput
                    key={`${setupUsername}:${usePin}`}
                    className="field"
                    name={usePin ? "pin" : "password"}
                    visibilityLabel={usePin ? "PIN" : "password"}
                    minLength={usePin ? 4 : bootstrap ? 8 : undefined}
                    maxLength={usePin ? 4 : undefined}
                    inputMode={usePin ? "numeric" : undefined}
                    pattern={usePin ? "[0-9]{4}" : undefined}
                    autoComplete={
                      bootstrap ? "new-password" : "current-password"
                    }
                    required
                  />
                </label>
                {usePin && <p className="text-sm text-[var(--muted)]">Set your PIN in Login PIN after signing in with your password. Five failed PIN attempts require password sign-in to unlock.</p>}
                {setupUsername && !bootstrap && <>
                  <p className="text-sm text-[var(--muted)]">For existing accounts without a username: verify your current email and password, then choose a username and new password. After setup, use your username to sign in.</p>
                  <label><span className="label">New password</span><PasswordInput className="field" name="newPassword" minLength={8} autoComplete="new-password" required /></label>
                  <label><span className="label">Confirm new password</span><PasswordInput className="field" name="confirmPassword" minLength={8} autoComplete="new-password" required /></label>
                </>}
                {(bootstrap || setupUsername) && <p className="text-sm text-[var(--muted)]">{PASSWORD_POLICY_MESSAGE}</p>}
                <button
                  disabled={submitting}
                  className="btn btn-primary w-full min-h-12"
                >
                  {submitting && (
                    <LoaderCircle size={18} className="loading-shimmer-icon" />
                  )}
                  {bootstrap ? "Create admin account" : setupUsername ? "Save username and sign in" : "Sign in"}
                </button>
              </form>
              {!bootstrap && <button type="button" disabled={submitting} className="mt-4 text-sm font-bold text-[var(--green)] underline" onClick={() => setSetupUsername((value) => !value)}>{setupUsername ? "Back to username sign-in" : "Existing account? Set up your username"}</button>}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
