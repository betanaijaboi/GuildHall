"use client";

import { Hand, Unlock } from "lucide-react";
import { useState, useTransition } from "react";
import { askToRelease, forceReleaseLock } from "@/app/actions/radar";

export function LockActions({ slug, lock, repoId, canForce }: { slug: string; lock: { id: string; path: string; owner: string }; repoId: number; canForce: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <span className="text-xs text-good">{done}</span>;
  return (
    <span className="flex gap-1">
      <button
        className="btn-ghost text-xs"
        disabled={pending}
        onClick={() => start(async () => { await askToRelease(slug, { path: lock.path, owner: lock.owner }); setDone("Asked in #art"); })}
      >
        <Hand size={13} /> Ask to release
      </button>
      {canForce && (
        <button
          className="btn-ghost text-xs text-bad"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Force-release ${lock.owner}'s lock on ${lock.path}? Their unpushed changes may conflict.`)) return;
            start(async () => { await forceReleaseLock(slug, { path: lock.path, owner: lock.owner, repoId, lockId: lock.id }); setDone("Released"); });
          }}
        >
          <Unlock size={13} /> Force unlock
        </button>
      )}
    </span>
  );
}
