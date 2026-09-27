/**
 * Jam mode (C4): host a jam (or mirror one running on itch.io), find teammates on a board,
 * and get an auto-created, time-boxed team workspace with deadline reminders.
 */

export type JamPhase = "upcoming" | "running" | "ended";

export function jamPhase(j: { startsAt: Date; endsAt: Date }, now: Date): JamPhase {
  if (now < j.startsAt) return "upcoming";
  return now < j.endsAt ? "running" : "ended";
}

/** The theme stays secret until the jam starts, except to its host. */
export function visibleTheme(j: { theme: string; startsAt: Date; hostId: string | null }, viewerId: string | null, now: Date): string | null {
  if (!j.theme) return null;
  return now >= j.startsAt || (viewerId !== null && viewerId === j.hostId) ? j.theme : null;
}

/** Deadline reminders posted to each team's #general, as hours before the end (0 = jam over). */
export const REMINDERS = [
  { hoursLeft: 24, text: "⏰ 24 hours left in the jam. Time to cut scope and lock the core loop." },
  { hoursLeft: 1, text: "⏰ 1 hour left. Build, upload and submit now; polish can wait." },
  { hoursLeft: 0, text: "🏁 The jam is over. Great work! Post your submission link if you haven't." },
] as const;

/** How many reminders should have been sent by `now` (reminders that are already past are skipped). */
export function remindersDue(j: { startsAt: Date; endsAt: Date }, now: Date): number {
  if (now < j.startsAt) return 0;
  let due = 0;
  REMINDERS.forEach((r, i) => {
    if (now.getTime() >= j.endsAt.getTime() - r.hoursLeft * 3_600_000) due = i + 1;
  });
  return due;
}

/** Which reminder text to post now, given how many were sent; only the latest due one, never a backlog. */
export function nextReminder(sent: number, due: number): { index: number; text: string } | null {
  if (due <= sent) return null;
  return { index: due, text: REMINDERS[due - 1].text };
}

export const ITCH_JAM_URL = /^https:\/\/itch\.io\/jam\/[a-z0-9-]{2,80}\/?$/i;

/** Submissions are https links; for itch-mirrored jams they must be an itch.io game page. */
export function validSubmission(url: string, itchJam: boolean): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Enter a full link, e.g. https://you.itch.io/your-game";
  }
  if (u.protocol !== "https:") return "Use an https link";
  if (itchJam && !/^[a-z0-9-]+\.itch\.io$/i.test(u.hostname)) return "This jam runs on itch.io, so link your itch.io game page";
  return null;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** The roles jam teams most often need; used for quick pickers on the team board. */
export const JAM_ROLES = [
  "engineering.gameplay", "design.systems", "design.level", "art.concept", "art.character", "art.environment",
  "art.pixel", "art.animation", "art.vfx", "art.ui", "audio.composition", "audio.sound_design", "narrative.writing", "production.qa",
] as const;
