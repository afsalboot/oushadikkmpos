"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ShoppingCart, Package, Users, ClipboardList, ReceiptText, Landmark, ChartNoAxesCombined, UserCog, Settings, LogOut, Menu, X, ChevronRight } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { useConfirm } from "@/components/ConfirmDialog";
import OushadhiLogo from "@/components/branding/OushadhiLogo";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/sales", label: "Sales", icon: ShoppingCart, permission: "sales.view" },
  { href: "/products", label: "Products", icon: Package, permission: "products.view" },
  { href: "/customers", label: "Customers", icon: Users, permission: "customers.view" },
  { href: "/purchases", label: "Purchases", icon: ClipboardList, permission: "purchases.view" },
  { href: "/expenses", label: "Expenses", icon: ReceiptText, permission: "expenses.view" },
  { href: "/accounts", label: "Accounts", icon: Landmark, permission: "accounts.view" },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, permission: "reports.view" },
  { href: "/staff", label: "Staff", icon: UserCog, permission: "staff.view" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings.view" },
];

export default function AppShell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const confirmAction = useConfirm();
  const [open, setOpen] = useState(false);
  const allowed = (permission) => user.role === "ADMIN" || user.permissions?.includes(permission);

  async function logout() {
    if (!await confirmAction({ title: "Log out?", description: "Are you sure you want to log out of your account?", confirmText: "Log out", cancelText: "Cancel", variant: "default" })) return;
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (mobile = false) => <><div className="flex h-20 items-center justify-between border-b border-white/10 px-5"><Link href="/dashboard" onClick={() => mobile && setOpen(false)} aria-label="Oushadhi POS dashboard"><OushadhiLogo tone="inverse" /></Link><button className="text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div><nav className="flex-1 overflow-y-auto p-3">{nav.filter((item) => allowed(item.permission)).map(({ href, label, icon: Icon }) => { const active = path === href || path.startsWith(href + "/"); return <Link key={href} href={href} onClick={() => setOpen(false)} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-white text-[#173d29]" : "text-emerald-50/75 hover:bg-white/10 hover:text-white"}`}><Icon size={19} /><span className="flex-1">{label}</span>{active && <ChevronRight size={15} />}</Link>; })}</nav><div className="flex flex-col border-t border-white/10 p-4"><NotificationBell enabled={allowed("products.view")} onNavigate={() => mobile && setOpen(false)} /><div className="mb-2 mt-1 flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 font-extrabold text-[#173d29]">{String(user.name || "U").charAt(0)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{user.name}</p><p className="text-xs text-emerald-100/55">{user.roleName || user.role}</p></div></div><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-bold text-emerald-50/70 hover:bg-white/10 hover:text-white"><LogOut size={17} />Sign out</button></div></>;

  return <div className="min-h-screen lg:grid lg:grid-cols-[244px_1fr]"><aside className="app-sidebar fixed inset-y-0 hidden w-[244px] flex-col bg-[#173d29] lg:flex">{sidebar()}</aside>{open && <><button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/35 lg:hidden" onClick={() => setOpen(false)} /><aside className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#173d29] lg:hidden">{sidebar(true)}</aside></>}<div className="min-w-0 lg:col-start-2"><header className="flex items-center justify-between px-4 pt-4 lg:hidden"><button className="grid size-11 place-items-center rounded-xl border border-[var(--line)] bg-white shadow-sm" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><Link href="/dashboard" aria-label="Oushadhi POS dashboard"><OushadhiLogo /></Link></header><main className="p-4 lg:p-8">{children}</main></div></div>;
}
