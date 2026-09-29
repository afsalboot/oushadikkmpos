import SettingsWorkspace from "@/components/SettingsWorkspace";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import DoctorSettings from "@/components/DoctorSettings";

export default async function Page() {
  const session = await requireSession();
  const storeAccess = session.role === "ADMIN" || session.permissions.includes("settings.view");
  return <div className="space-y-6">
    <section className="card p-5"><h2 className="text-lg font-extrabold">My account security</h2><p className="mt-1 text-sm text-[var(--muted)]">Manage your own sign-in credentials.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="btn" href="/settings/login-pin">Login PIN</Link><Link className="btn" href="/settings/change-password">Change password</Link></div></section>
    {storeAccess && <SettingsWorkspace />}
    {!storeAccess && session.permissions.includes("doctor.view") && <section className="space-y-4"><h2 className="text-xl font-bold">Consultation · Doctors</h2><DoctorSettings /></section>}
  </div>;
}
