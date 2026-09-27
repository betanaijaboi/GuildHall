/* eslint-disable @next/next/no-img-element */
import { resolveAvatar } from "@/lib/avatar";
import { AvatarArt } from "./avatar-art";

export type AvatarUser = { handle: string; name: string; avatarUrl?: string | null; avatar?: unknown };

/**
 * A user's avatar: their designed character (or a unique default from their handle), or their
 * GitHub photo if they chose that. `ring` adds the animated gradient ring used on profiles.
 */
export function Avatar({ user, size = 32, ring = false, frame }: { user: AvatarUser; size?: number; ring?: boolean; frame?: string }) {
  const config = resolveAvatar(user.avatar, user.handle);
  const photo = config.mode === "photo" && user.avatarUrl;
  const inner = (
    <span className="avatar block overflow-hidden rounded-full" style={{ width: size, height: size }}>
      {photo ? (
        <img src={user.avatarUrl!} alt={user.name} width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <AvatarArt config={config} title={user.name} />
      )}
    </span>
  );
  if (frame && !ring) {
    // Guild Rank frame: a solid ring in the rank's colour with a soft glow.
    return (
      <span className="inline-block shrink-0 rounded-full p-[2px]" style={{ background: frame, boxShadow: `0 0 ${Math.max(6, size / 6)}px ${frame}66` }}>
        {inner}
      </span>
    );
  }
  if (!ring) return <span className="inline-block shrink-0">{inner}</span>;
  return <span className="avatar-ring inline-block shrink-0 rounded-full p-[3px]">{inner}</span>;
}

/** The Guildhall bot's avatar, used for system and GitHub messages. */
export function BotAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-lg shadow-violet-500/20"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
        <path d="M9 12 L11 14 L15 10" />
      </svg>
    </span>
  );
}
