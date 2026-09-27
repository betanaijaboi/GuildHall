import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { channels, huddles } from "@/db/schema";
import { aiConfigured, aiParse } from "@/lib/ai";
import { canAccessChannel } from "@/lib/channel-access";
import { normaliseRecap, recapSchema, transcriptFor } from "@/lib/huddles";
import { activeParticipants, endHuddle, type Recapper } from "@/lib/huddles-db";

/** Claude recap (structured output), or undefined so the rule-based recap is used. */
export function recapper(): Recapper | undefined {
  if (!aiConfigured()) return undefined;
  return async (lines, notes, participants, minutes) => {
    const out = await aiParse({
      schema: recapSchema,
      effort: "medium",
      maxTokens: 8000,
      system:
        "You write recaps of voice calls between people making a video game together. Use only what's in the captions and notes; never invent decisions or tasks. Captions come from browser speech recognition and may contain mis-heard words; prefer the notes when they conflict. Owners must be one of the participant handles given, or null.",
      user: `Participants: ${participants.map((p) => `${p.name} (@${p.handle})`).join(", ")}\nLength: ${Math.round(minutes)} minutes\n\n${transcriptFor(lines, notes)}`,
    });
    return out ? normaliseRecap(out, participants) : null;
  };
}

/** The huddle plus its channel, if this user may be in it (members, partner members, granted guests). */
export async function loadHuddle(huddleId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(huddleId)) return null;
  const [row] = await db.select({ huddle: huddles, channel: channels }).from(huddles).innerJoin(channels, eq(channels.id, huddles.channelId)).where(eq(huddles.id, huddleId)).limit(1);
  if (!row || !(await canAccessChannel(db, row.channel.id, userId))) return null;
  return row;
}

const pendingEnds = new Map<string, ReturnType<typeof setTimeout>>();

/** When the last person leaves, end the huddle after a grace period (a page reload isn't a hang-up). */
export function scheduleEndIfEmpty(huddleId: string, graceMs = 20_000): void {
  clearTimeout(pendingEnds.get(huddleId));
  pendingEnds.set(
    huddleId,
    setTimeout(async () => {
      pendingEnds.delete(huddleId);
      try {
        if ((await activeParticipants(db, huddleId)).length === 0) await endHuddle(db, huddleId, recapper());
      } catch (err) {
        console.error("auto-ending huddle failed", err);
      }
    }, graceMs),
  );
}
