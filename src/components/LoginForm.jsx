"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import OushadhiLogo from "@/components/branding/OushadhiLogo";
import PasswordInput from "@/components/PasswordInput";
export default function LoginForm() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pinLogin, setPinLogin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(({ data }) => setBootstrap(data.needsBootstrap))
      .catch(() => toast.error("Could not connect to the application database"))
      .finally(() => setLoading(false));
  }, []);
  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = Object.fromEntries(new FormData(e.currentTarget));
      const response = await fetch(
        bootstrap ? "/api/auth/bootstrap" : pinLogin ? "/api/auth/pin-login" : "/api/auth/login",
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
                  {bootstrap ? "Create the first admin" : "Welcome back"}
                </h2>
                <p className="mt-2 text-[var(--muted)]">
                  {bootstrap
                    ? "No account exists yet. Set up the store owner account."
                    : "Sign in to open the Oushadi workspace."}
                </p>
              </div>
              <form onSubmit={submit} className="space-y-5">
                {!bootstrap && <div className="flex gap-2" aria-label="Sign-in method">
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
                <label>
                  <span className="label">Email address</span>
                  <input
                    className="field"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  <span className="label">{pinLogin && !bootstrap ? "4-digit PIN" : "Password"}</span>
                  <PasswordInput
                    key={pinLogin && !bootstrap ? "pin" : "password"}
                    className="field"
                    name={pinLogin && !bootstrap ? "pin" : "password"}
                    visibilityLabel={pinLogin && !bootstrap ? "PIN" : "password"}
                    minLength={pinLogin && !bootstrap ? 4 : 8}
                    maxLength={pinLogin && !bootstrap ? 4 : undefined}
                    inputMode={pinLogin && !bootstrap ? "numeric" : undefined}
                    pattern={pinLogin && !bootstrap ? "[0-9]{4}" : undefined}
                    autoComplete={
                      bootstrap ? "new-password" : "current-password"
                    }
                    required
                  />
                </label>
                {pinLogin && !bootstrap && <p className="text-sm text-[var(--muted)]">First sign in with your password, then open Login PIN in the sidebar to set your PIN. After five failed attempts, use your password to unlock it.</p>}
                <button
                  disabled={submitting}
                  className="btn btn-primary w-full min-h-12"
                >
                  {submitting && (
                    <LoaderCircle size={18} className="loading-shimmer-icon" />
                  )}
                  {bootstrap ? "Create admin account" : "Sign in"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
