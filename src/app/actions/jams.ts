"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { jams, jamSeekers, jamTeams, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ITCH_JAM_URL } from "@/lib/jams";
import { formTeam, requestToJoin, respondToRequest, submitEntry, uniqueJamSlug } from "@/lib/jams-db";
import { ENGINES, isSkillId } from "@/lib/taxonomy";

const when = z.string().min(10).transform((v, ctx) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) ctx.addIssue({ code: "custom", message: "Invalid date" });
  return d;
});

export async function createJam(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = z
    .object({
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().max(4000),
      theme: z.string().trim().max(120),
      itchUrl: z.string().trim().regex(ITCH_JAM_URL, "Paste an itch.io jam link like https://itch.io/jam/your-jam").or(z.literal("")),
      startsAt: when,
      endsAt: when,
      maxTeamSize: z.coerce.number().int().min(1).max(12),
    })
    .parse(Object.fromEntries(["name", "description", "theme", "itchUrl", "startsAt", "endsAt", "maxTeamSize"].map((k) => [k, form.get(k) ?? ""])));
  if (data.endsAt <= data.startsAt) throw new Error("The jam must end after it starts");
  if (data.endsAt.getTime() - data.startsAt.getTime() > 31 * 86_400_000) throw new Error("Jams can run for up to a month");
  const slug = await uniqueJamSlug(db, data.name);
  await db.insert(jams).values({ ...data, itchUrl: data.itchUrl || null, slug, hostId: user.id });
  redirect(`/jams/${slug}`);
}

async function loadJam(slug: string) {
  const [jam] = await db.select().from(jams).where(eq(jams.slug, z.string().max(80).parse(slug))).limit(1);
  if (!jam) throw new Error("Jam not found");
  return jam;
}

export async function postSeeker(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const jam = await loadJam(slug);
  const note = z.string().trim().max(400).parse(form.get("note") ?? "");
  const skills = form.getAll("skill").map(String).filter(isSkillId).slice(0, 6);
  await db.insert(jamSeekers).values({ jamId: jam.id, userId: user.id, note, skills }).onConflictDoUpdate({ target: [jamSeekers.jamId, jamSeekers.userId], set: { note, skills } });
  revalidatePath(`/jams/${slug}`);
}

export async function removeSeeker(slug: string): Promise<void> {
  const user = await requireUser();
  const jam = await loadJam(slug);
  await db.delete(jamSeekers).where(and(eq(jamSeekers.jamId, jam.id), eq(jamSeekers.userId, user.id)));
  revalidatePath(`/jams/${slug}`);
}

export async function formTeamAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const jam = await loadJam(slug);
  const name = z.string().trim().min(2).max(60).parse(form.get("name"));
  const engine = z.enum(ENGINES.map((e) => e.id) as [string, ...string[]]).parse(form.get("engine"));
  const lookingFor = form.getAll("lookingFor").map(String).filter(isSkillId);
  const { project } = await formTeam(db, jam, user.id, { name, engine, lookingFor });
  redirect(`/p/${project.slug}/workspace/general`);
}

export async function requestToJoinAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  await loadJam(slug);
  await requestToJoin(db, z.string().uuid().parse(form.get("teamId")), user.id, z.string().trim().max(500).parse(form.get("message") ?? ""));
  revalidatePath(`/jams/${slug}`);
}

/** Only the team's owner answers join requests. */
async function ownTeam(teamId: string, userId: string) {
  const [row] = await db.select({ team: jamTeams, ownerId: projects.ownerId }).from(jamTeams).innerJoin(projects, eq(projects.id, jamTeams.projectId)).where(eq(jamTeams.id, teamId)).limit(1);
  if (!row || row.ownerId !== userId) throw new Error("Only the team's founder can do that");
  return row.team;
}

export async function respondToRequestAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const teamId = z.string().uuid().parse(form.get("teamId"));
  await ownTeam(teamId, user.id);
  await respondToRequest(db, teamId, z.string().uuid().parse(form.get("userId")), form.get("accept") === "1");
  revalidatePath(`/jams/${slug}`);
}

export async function submitEntryAction(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const teamId = z.string().uuid().parse(form.get("teamId"));
  await ownTeam(teamId, user.id);
  await submitEntry(db, teamId, z.string().trim().max(300).parse(form.get("url")));
  revalidatePath(`/jams/${slug}`);
}
