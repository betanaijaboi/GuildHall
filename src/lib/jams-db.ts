import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { jamRequests, jams, jamSeekers, jamTeams, memberships, milestones, projects, users } from "@/db/schema";
import { jamPhase, nextReminder, remindersDue, validSubmission } from "@/lib/jams";
import { channelByName, createDefaultChannels, postMessage, type Notify } from "@/lib/messages";
import { milestoneFor } from "@/lib/milestones";
import { uniqueProjectSlug } from "@/lib/project-slug";
import { slugify } from "@/lib/slug";
import { publish } from "@/lib/pubsub";

export type Jam = typeof jams.$inferSelect;

export async function uniqueJamSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await db.select({ id: jams.id }).from(jams).where(eq(jams.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** The team (if any) this user is on for a jam. One team per person per jam. */
export async function teamOf(db: Db, jamId: string, userId: string) {
  const [row] = await db
    .select({ team: jamTeams, project: projects })
    .from(jamTeams)
    .innerJoin(projects, eq(projects.id, jamTeams.projectId))
    .innerJoin(memberships, and(eq(memberships.projectId, jamTeams.projectId), eq(memberships.userId, userId)))
    .where(eq(jamTeams.jamId, jamId))
    .limit(1);
  return row ?? null;
}

async function teamSize(db: Db, projectId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.projectId, projectId));
  return r.n;
}

/**
 * Form a team: creates its workspace (a jam project with the default channels), makes the
 * founder its owner and takes them off the "looking for a team" board.
 */
export async function formTeam(db: Db, jam: Jam, founderId: string, input: { name: string; engine: string; lookingFor: string[] }, now = new Date()) {
  if (jamPhase(jam, now) === "ended") throw new Error("This jam has ended");
  if (await teamOf(db, jam.id, founderId)) throw new Error("You're already on a team for this jam");
  const slug = await uniqueProjectSlug(db, `${jam.slug} ${input.name}`);
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [project] = await t
      .insert(projects)
      .values({
        slug,
        name: input.name,
        pitch: `Team for ${jam.name}.`,
        engine: input.engine as typeof projects.$inferInsert.engine,
        stage: "prototype",
        visibility: "public",
        engagement: "jam",
        ownerId: founderId,
      })
      .returning();
    await t.insert(memberships).values({ projectId: project.id, userId: founderId, role: "owner" });
    await createDefaultChannels(t, project.id);
    await t.insert(milestones).values({ projectId: project.id, ...milestoneFor("prototype") });
    const [team] = await t.insert(jamTeams).values({ jamId: jam.id, projectId: project.id, lookingFor: input.lookingFor.slice(0, 8) }).returning();
    await t.delete(jamSeekers).where(and(eq(jamSeekers.jamId, jam.id), eq(jamSeekers.userId, founderId)));
    const general = await channelByName(t, project.id, "general");
    if (general) {
      await postMessage(t, {
        channelId: general.id,
        authorId: null,
        body: `🎮 Welcome to your ${jam.name} workspace! Deadline: ${jam.endsAt.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC. Keep scope tiny, build the core loop first, and I'll post reminders at 24h and 1h left.`,
      }, () => {});
    }
    return { team, project };
  });
}

export async function requestToJoin(db: Db, teamId: string, userId: string, message: string): Promise<void> {
  const [row] = await db.select({ team: jamTeams, jam: jams }).from(jamTeams).innerJoin(jams, eq(jams.id, jamTeams.jamId)).where(eq(jamTeams.id, teamId)).limit(1);
  if (!row) throw new Error("Team not found");
  if (jamPhase(row.jam, new Date()) === "ended") throw new Error("This jam has ended");
  if (await teamOf(db, row.jam.id, userId)) throw new Error("You're already on a team for this jam");
  if ((await teamSize(db, row.team.projectId)) >= row.jam.maxTeamSize) throw new Error("This team is full");
  await db
    .insert(jamRequests)
    .values({ teamId, userId, message: message.slice(0, 500) })
    .onConflictDoUpdate({ target: [jamRequests.teamId, jamRequests.userId], set: { status: "pending", message: message.slice(0, 500) } });
}

/**
 * The team owner answers a request. Accepting re-checks the size limit and the one-team rule
 * inside a transaction (locking the team) so two accepts can't overfill it.
 */
export async function respondToRequest(db: Db, teamId: string, userId: string, accept: boolean, notify: Notify = publish): Promise<void> {
  const pending: Parameters<Notify>[] = [];
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t.select({ team: jamTeams, jam: jams }).from(jamTeams).innerJoin(jams, eq(jams.id, jamTeams.jamId)).where(eq(jamTeams.id, teamId)).for("update").limit(1);
    if (!row) throw new Error("Team not found");
    const [req] = await t.select().from(jamRequests).where(and(eq(jamRequests.teamId, teamId), eq(jamRequests.userId, userId), eq(jamRequests.status, "pending"))).limit(1);
    if (!req) throw new Error("No pending request");
    if (!accept) {
      await t.update(jamRequests).set({ status: "declined" }).where(and(eq(jamRequests.teamId, teamId), eq(jamRequests.userId, userId)));
      return;
    }
    if (await teamOf(t, row.jam.id, userId)) throw new Error("They already joined another team");
    if ((await teamSize(t, row.team.projectId)) >= row.jam.maxTeamSize) throw new Error("Your team is full");
    await t.insert(memberships).values({ projectId: row.team.projectId, userId, role: "member" });
    await t.update(jamRequests).set({ status: "accepted" }).where(and(eq(jamRequests.teamId, teamId), eq(jamRequests.userId, userId)));
    // They're on a team now: clear their board post and other pending requests for this jam.
    await t.delete(jamSeekers).where(and(eq(jamSeekers.jamId, row.jam.id), eq(jamSeekers.userId, userId)));
    const otherTeams = (await t.select({ id: jamTeams.id }).from(jamTeams).where(eq(jamTeams.jamId, row.jam.id))).map((x) => x.id);
    await t.update(jamRequests).set({ status: "declined" }).where(and(eq(jamRequests.userId, userId), eq(jamRequests.status, "pending"), inArray(jamRequests.teamId, otherTeams)));
    const [u] = await t.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    const general = await channelByName(t, row.team.projectId, "general");
    if (general) await postMessage(t, { channelId: general.id, authorId: null, body: `👋 ${u?.name ?? "A new teammate"} joined the team!` }, (...a) => pending.push(a));
  });
  for (const a of pending) notify(...a);
}

export async function submitEntry(db: Db, teamId: string, url: string, now = new Date()): Promise<void> {
  const [row] = await db.select({ team: jamTeams, jam: jams }).from(jamTeams).innerJoin(jams, eq(jams.id, jamTeams.jamId)).where(eq(jamTeams.id, teamId)).limit(1);
  if (!row) throw new Error("Team not found");
  if (now < row.jam.startsAt) throw new Error("The jam hasn't started yet");
  // Guildhall-hosted jams close submissions at the deadline; itch jams are judged on itch.
  if (!row.jam.itchUrl && now >= row.jam.endsAt) throw new Error("Submissions closed when the jam ended");
  const problem = validSubmission(url, Boolean(row.jam.itchUrl));
  if (problem) throw new Error(problem);
  await db.update(jamTeams).set({ submissionUrl: url, submittedAt: now }).where(eq(jamTeams.id, teamId));
}

/** Hourly: post the next due deadline reminder in each team's #general (at most one per run). */
export async function runJamReminders(db: Db, now: Date, notify: Notify = publish): Promise<number> {
  const rows = await db
    .select({ team: jamTeams, jam: jams })
    .from(jamTeams)
    .innerJoin(jams, eq(jams.id, jamTeams.jamId))
    .where(and(sql`${jams.startsAt} <= ${now.toISOString()}::timestamptz`, sql`${jams.endsAt} > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz`));
  let posted = 0;
  for (const { team, jam } of rows) {
    const next = nextReminder(team.remindersSent, remindersDue(jam, now));
    if (!next) continue;
    // Claim the reminder first so overlapping runs never double-post.
    const claimed = await db.update(jamTeams).set({ remindersSent: next.index }).where(and(eq(jamTeams.id, team.id), eq(jamTeams.remindersSent, team.remindersSent))).returning();
    if (!claimed.length) continue;
    const general = await channelByName(db, team.projectId, "general");
    if (general) {
      await postMessage(db, { channelId: general.id, authorId: null, body: next.text }, notify);
      posted++;
    }
  }
  return posted;
}
