import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { channels, huddleCaptions, huddleParticipants, huddles, memberships, messages, tasks, users, type HuddleRecap } from "@/db/schema";
import { ruleRecap, type Line } from "@/lib/huddles";
import { postMessage, type Notify } from "@/lib/messages";
import { publish, publishHuddle } from "@/lib/pubsub";

export type Huddle = typeof huddles.$inferSelect;
export type Recapper = (lines: Line[], notes: string, participants: { name: string; handle: string }[], minutes: number) => Promise<HuddleRecap | null>;

export const huddleUrl = (id: string) => `/huddle/${id}`;

export async function activeHuddle(db: Db, channelId: string): Promise<Huddle | null> {
  const [h] = await db.select().from(huddles).where(and(eq(huddles.channelId, channelId), isNull(huddles.endedAt))).limit(1);
  return h ?? null;
}

/** Start a huddle in a channel, or return the one already running (one per channel). */
export async function startHuddle(db: Db, channelId: string, userId: string, notify: Notify = publish): Promise<{ huddle: Huddle; created: boolean }> {
  const [created] = await db.insert(huddles).values({ channelId, startedBy: userId }).onConflictDoNothing().returning();
  if (!created) {
    const existing = await activeHuddle(db, channelId);
    if (!existing) throw new Error("Couldn't start the huddle; try again");
    return { huddle: existing, created: false };
  }
  const [c] = await db.select({ name: channels.name }).from(channels).where(eq(channels.id, channelId)).limit(1);
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  await postMessage(
    db,
    {
      channelId,
      authorId: null,
      threadKey: `huddle:${created.id}`,
      body: `🎧 ${u?.name ?? "Someone"} started a huddle in #${c?.name ?? "channel"}.`,
      card: { kind: "huddle", title: "Join the huddle", url: huddleUrl(created.id), state: "live", lines: ["Voice, video and screen share with draw-over", "Recap and follow-up tasks when it ends"] },
    },
    notify,
  );
  return { huddle: created, created: true };
}

export type Participant = { id: string; name: string; handle: string };

export async function activeParticipants(db: Db, huddleId: string): Promise<Participant[]> {
  return db
    .select({ id: users.id, name: users.name, handle: users.handle })
    .from(huddleParticipants)
    .innerJoin(users, eq(users.id, huddleParticipants.userId))
    .where(and(eq(huddleParticipants.huddleId, huddleId), isNull(huddleParticipants.leftAt), gt(huddleParticipants.connections, 0)))
    .orderBy(asc(huddleParticipants.joinedAt));
}

/** A browser opened the huddle's event stream. Counts connections so a second tab isn't a leave. */
export async function connect(db: Db, huddleId: string, userId: string): Promise<Participant[]> {
  await db
    .insert(huddleParticipants)
    .values({ huddleId, userId, connections: 1 })
    .onConflictDoUpdate({ target: [huddleParticipants.huddleId, huddleParticipants.userId], set: { connections: sql`${huddleParticipants.connections} + 1`, leftAt: null } });
  const list = await activeParticipants(db, huddleId);
  publishHuddle(huddleId, { type: "presence", participants: list });
  return list;
}

/** A stream closed. Returns how many people are still in the call. */
export async function disconnect(db: Db, huddleId: string, userId: string): Promise<number> {
  await db
    .update(huddleParticipants)
    .set({
      connections: sql`greatest(${huddleParticipants.connections} - 1, 0)`,
      leftAt: sql`case when ${huddleParticipants.connections} <= 1 then now() else null end`,
    })
    .where(and(eq(huddleParticipants.huddleId, huddleId), eq(huddleParticipants.userId, userId)));
  const list = await activeParticipants(db, huddleId);
  publishHuddle(huddleId, { type: "presence", participants: list });
  return list.length;
}

/**
 * End a huddle (idempotent: only the first caller builds the recap). The recap comes from
 * `recapper` (Claude) when given and it succeeds, otherwise from the rule-based fallback.
 */
export async function endHuddle(db: Db, huddleId: string, recapper?: Recapper, notify: Notify = publish): Promise<HuddleRecap | null> {
  const [h] = await db.update(huddles).set({ endedAt: new Date() }).where(and(eq(huddles.id, huddleId), isNull(huddles.endedAt))).returning();
  if (!h) return null;
  await db.update(huddleParticipants).set({ leftAt: sql`coalesce(${huddleParticipants.leftAt}, now())`, connections: 0 }).where(eq(huddleParticipants.huddleId, huddleId));

  const [people, caps] = await Promise.all([
    db.select({ name: users.name, handle: users.handle }).from(huddleParticipants).innerJoin(users, eq(users.id, huddleParticipants.userId)).where(eq(huddleParticipants.huddleId, huddleId)).orderBy(asc(huddleParticipants.joinedAt)),
    db.select({ text: huddleCaptions.text, speaker: users.name, handle: users.handle }).from(huddleCaptions).leftJoin(users, eq(users.id, huddleCaptions.userId)).where(eq(huddleCaptions.huddleId, huddleId)).orderBy(asc(huddleCaptions.at)),
  ]);
  const lines: Line[] = caps.map((c) => ({ text: c.text, speaker: c.speaker ?? "Someone", handle: c.handle ?? "someone" }));
  const minutes = (h.endedAt!.getTime() - h.startedAt.getTime()) / 60_000;
  let recap: HuddleRecap | null = null;
  if (recapper && (lines.length || h.notes.trim())) {
    try {
      recap = await recapper(lines, h.notes, people, minutes);
    } catch (err) {
      console.warn("AI recap failed; using rules", err);
    }
  }
  recap ??= ruleRecap(lines, h.notes, people, minutes);

  const [start] = await db.select().from(messages).where(and(eq(messages.channelId, h.channelId), eq(messages.threadKey, `huddle:${h.id}`), isNull(messages.threadRootId))).limit(1);
  if (start?.card) await db.update(messages).set({ card: { ...start.card, title: "Huddle ended", state: "ended", lines: [`${Math.max(1, Math.round(minutes))} min · ${people.map((p) => p.name).join(", ") || "no one joined"}`] } }).where(eq(messages.id, start.id));
  const msg = await postMessage(
    db,
    {
      channelId: h.channelId,
      authorId: null,
      threadKey: `huddle-recap:${h.id}`,
      body: `📝 Huddle recap: ${recap.summary}`,
      card: {
        kind: "huddle",
        title: "Huddle recap",
        url: huddleUrl(h.id),
        state: "ended",
        lines: [...recap.decisions.map((d) => `✔ ${d}`), ...recap.actions.map((a) => `☐ ${a.title}${a.owner ? ` (@${a.owner})` : ""}`)].slice(0, 12),
      },
    },
    notify,
  );
  await db.update(huddles).set({ recap, recapMessageId: msg.id }).where(eq(huddles.id, h.id));
  publishHuddle(h.id, { type: "ended", recapUrl: huddleUrl(h.id) });
  return recap;
}

/**
 * Turn chosen recap actions into tasks on the project that owns the channel. Owners become
 * assignees when they're on that project's team (guests are never assigned).
 */
export async function createRecapTasks(db: Db, huddleId: string, indices: number[], byName: string): Promise<number> {
  const pending: Parameters<Notify>[] = [];
  const count = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t.select({ h: huddles, projectId: channels.projectId }).from(huddles).innerJoin(channels, eq(channels.id, huddles.channelId)).where(eq(huddles.id, huddleId)).for("update").limit(1);
    if (!row?.h.recap) throw new Error("This huddle has no recap yet");
    const recap = row.h.recap;
    const chosen = [...new Set(indices)].filter((i) => recap.actions[i] && !recap.actions[i].taskId);
    if (!chosen.length) return 0;
    const owners = [...new Set(chosen.map((i) => recap.actions[i].owner).filter((o): o is string => !!o))];
    const team = owners.length
      ? await t
          .select({ id: users.id, handle: users.handle })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.projectId, row.projectId), inArray(users.handle, owners), ne(memberships.role, "guest")))
      : [];
    const idOf = new Map(team.map((m) => [m.handle, m.id]));
    const actions = [...recap.actions];
    for (const i of chosen) {
      const a = actions[i];
      const [task] = await t
        .insert(tasks)
        .values({ projectId: row.projectId, title: a.title, body: `From the huddle recap: ${huddleUrl(huddleId)}`, assigneeId: a.owner ? idOf.get(a.owner) ?? null : null })
        .returning();
      actions[i] = { ...a, taskId: task.id };
    }
    await t.update(huddles).set({ recap: { ...recap, actions } }).where(eq(huddles.id, huddleId));
    if (row.h.recapMessageId) {
      await postMessage(t, { channelId: row.h.channelId, authorId: null, threadRootId: row.h.recapMessageId, body: `${byName} added ${chosen.length} task${chosen.length === 1 ? "" : "s"} from this recap to the board.` }, (...args) => pending.push(args));
    }
    return chosen.length;
  });
  // Live updates only after commit.
  for (const args of pending) publish(...args);
  return count;
}
