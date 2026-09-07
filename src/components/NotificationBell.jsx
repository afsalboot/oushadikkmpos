"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "@/lib/notification-sound";

const SOUND_SEEN_KEY = "oushadi-notification-sound-seen-v2";

function getSeenNotificationIds() {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SOUND_SEEN_KEY) || "[]",
    );
    return new Set(
      Array.isArray(value) ? value.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function saveSeenNotificationIds(ids) {
  try {
    window.localStorage.setItem(
      SOUND_SEEN_KEY,
      JSON.stringify([...ids].slice(-500)),
    );
  } catch {}
}

export default function NotificationBell({ enabled = true, onNavigate }) {
  const [count, setCount] = useState(0);
  const requestVersion = useRef(0);
  const soundUnlocked = useRef(false);
  const seenSoundIds = useRef(null);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && version === requestVersion.current) {
        const unreadIds = new Set(
          (result.data?.items || [])
            .filter((item) => !item.read)
            .map((item) => item.id),
        );
        seenSoundIds.current ||= getSeenNotificationIds();
        const newUnreadIds = [...unreadIds].filter(
          (id) => !seenSoundIds.current.has(id),
        );
        const nextCount = Number(result.data?.unreadCount || 0);
        setCount((current) => (current === nextCount ? current : nextCount));
        if (newUnreadIds.length) {
          if (
            !soundUnlocked.current &&
            window.navigator.userActivation?.hasBeenActive
          )
            soundUnlocked.current = await unlockNotificationSound();
          if (soundUnlocked.current) await playNotificationSound();
          for (const id of newUnreadIds) seenSoundIds.current.add(id);
          saveSeenNotificationIds(seenSoundIds.current);
        }
      }
    } catch {}
  }, [enabled]);

  useEffect(() => {
    const unlockSound = async () => {
      soundUnlocked.current = await unlockNotificationSound();
    };
    const firstLoad = window.setTimeout(load, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    const refresh = () => document.visibilityState === "visible" && load();
    window.addEventListener("pointerdown", unlockSound, { once: true });
    window.addEventListener("keydown", unlockSound, { once: true });
    window.addEventListener("focus", refresh);
    window.addEventListener("oushadi-notifications-changed", load);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("oushadi-notifications-changed", load);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  if (!enabled) return null;
  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      className="mb-2 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-bold text-emerald-50/80 transition hover:bg-white/10 hover:text-white"
    >
      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-[#173d29]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="flex-1 text-left">Notifications</span>
      <ChevronRight size={15} />
    </Link>
  );
}
