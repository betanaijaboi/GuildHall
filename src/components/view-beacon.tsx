"use client";

import { useEffect } from "react";

// A page mounts its effect twice in development, and fast re-renders can repeat it: send each
// subject at most once per couple of seconds.
const recent = new Map<string, number>();

/** Tells analytics (C23) that this page was viewed. No cookies. */
export function ViewBeacon({ type, id }: { type: "profile" | "project"; id: string }) {
  useEffect(() => {
    const key = `${type}:${id}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < 2000) return;
    recent.set(key, now);
    const body = JSON.stringify({ type, id, referrer: document.referrer || undefined });
    fetch("/api/views", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }, [type, id]);
  return null;
}
