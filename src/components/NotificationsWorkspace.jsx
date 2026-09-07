"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  LoaderCircle,
  PackageSearch,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

const iconFor = {
  LOW_STOCK: PackageSearch,
  EXPIRY: Clock3,
  EXPIRED: CircleAlert,
  PURCHASE_DUE: ReceiptText,
};
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Active now";

export default function NotificationsWorkspace() {
  const confirmAction = useConfirm();
  const [data, setData] = useState({ count: 0, unreadCount: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to load notifications");
      if (version === requestVersion.current) setData(result.data);
    } catch (error) {
      if (version === requestVersion.current) toast.error(error.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 30_000);
    const refresh = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function change(method, body, key, success) {
    requestVersion.current += 1;
    setBusy(key);
    try {
      const response = await fetch("/api/notifications", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to update notifications");
      requestVersion.current += 1;
      setData(result.data);
      window.dispatchEvent(new Event("oushadi-notifications-changed"));
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  const markAllRead = () =>
    change(
      "PATCH",
      { all: true },
      "read-all",
      "All notifications marked as read.",
    );
  const clearAll = async () => {
    if (
      await confirmAction({
        title: "Clear all notifications?",
        description:
          "This will remove all current notifications. New alerts will continue to appear automatically.",
        confirmText: "Clear all",
        cancelText: "Cancel",
        variant: "warning",
      })
    )
      change("DELETE", { all: true }, "clear-all", "Notifications cleared.");
  };

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[var(--green)]">
            Activity centre
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Notifications</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Stock, expiry and supplier-payment alerts update automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={!data.unreadCount || Boolean(busy)}
            onClick={markAllRead}
          >
            {busy === "read-all" ? (
              <LoaderCircle className="loading-shimmer-icon" size={16} />
            ) : (
              <CheckCheck size={16} />
            )}
            Mark all as read
          </button>
          <button
            className="btn btn-danger"
            disabled={!data.count || Boolean(busy)}
            onClick={clearAll}
          >
            {busy === "clear-all" ? (
              <LoaderCircle className="loading-shimmer-icon" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
            Clear all
          </button>
        </div>
      </header>
      <section className="mb-5 grid grid-cols-2 gap-3 sm:max-w-lg">
        <article className="card p-4">
          <p className="text-sm font-bold text-[var(--muted)]">
            Active notifications
          </p>
          <strong className="mt-2 block text-3xl">
            {loading ? "—" : data.count}
          </strong>
        </article>
        <article className="card p-4">
          <p className="text-sm font-bold text-[var(--muted)]">Unread</p>
          <strong className="mt-2 block text-3xl text-[var(--green)]">
            {loading ? "—" : data.unreadCount}
          </strong>
        </article>
      </section>
      {loading ? (
        <section className="card space-y-3 p-5">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="h-20 loading-shimmer rounded-xl bg-slate-100"
              key={index}
            />
          ))}
        </section>
      ) : data.items.length ? (
        <section className="card divide-y divide-[var(--line)] overflow-hidden">
          {data.items.map((item) => {
            const Icon = iconFor[item.type] || Bell;
            return (
              <article
                className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center ${item.read ? "bg-white" : "bg-emerald-50/45"}`}
                key={item.id}
              >
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-xl ${item.type === "EXPIRED" ? "bg-red-50 text-red-600" : item.type === "EXPIRY" ? "bg-amber-50 text-amber-700" : "bg-[var(--green-soft)] text-[var(--green)]"}`}
                >
                  <Icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong>{item.title}</strong>
                    {!item.read && (
                      <span
                        className="size-2 rounded-full bg-[var(--green)]"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.detail}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {dateTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!item.read && (
                    <button
                      className="btn !min-h-9"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        change("PATCH", { id: item.id }, `read-${item.id}`)
                      }
                    >
                      {busy === `read-${item.id}` ? (
                        <LoaderCircle
                          className="loading-shimmer-icon"
                          size={15}
                        />
                      ) : (
                        <Check size={15} />
                      )}
                      Mark read
                    </button>
                  )}
                  <Link className="btn !min-h-9" href={item.href}>
                    View
                  </Link>
                  <button
                    className="btn !min-h-9 !px-3"
                    disabled={Boolean(busy)}
                    aria-label={`Clear ${item.title}`}
                    onClick={() =>
                      change("DELETE", { id: item.id }, `clear-${item.id}`)
                    }
                  >
                    {busy === `clear-${item.id}` ? (
                      <LoaderCircle
                        className="loading-shimmer-icon"
                        size={15}
                      />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="card grid min-h-72 place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]">
              <Bell size={25} />
            </span>
            <h2 className="mt-4 text-lg font-extrabold">
              You’re all caught up
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              New operational alerts will appear here automatically.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
