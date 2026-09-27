"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { applications, memberships, milestones, projectRepos, projects, roleListings, users } from "@/db/schema";
import { loadProject, roleAtLeast } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { githubConfigured } from "@/lib/env";
import { removeCollaborator } from "@/lib/github/client";
import { GITHUB_PERMISSION, grantRepoAccess } from "@/lib/repo-access";
import { fireEvent } from "@/lib/automations-db";
import { alertForListing } from "@/lib/alerts-db";
import { revokeGuestGrants } from "@/lib/guests";
import { channelByName, createDefaultChannels, postMessage } from "@/lib/messages";
import { uniqueProjectSlug } from "@/lib/project-slug";
import { milestoneFor } from "@/lib/milestones";
import { ENGAGEMENTS, ENGINES, isSkillId, PLATFORMS, skillLabel, STAGES, type StageId } from "@/lib/taxonomy";

const stageIds = STAGES.map((s) => s.id) as [StageId, ...StageId[]];
const engagementIds = ENGAGEMENTS.map((e) => e.id) as [string, ...string[]];

const projectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  pitch: z.string().trim().max(2000),
  engine: z.enum(ENGINES.map((e) => e.id) as [string, ...string[]]),
  stage: z.enum(stageIds),
  visibility: z.enum(["public", "private"]),
  engagement: z.enum(engagementIds),
  genres: z.string().max(200),
});

const uniqueSlug = (name: string) => uniqueProjectSlug(db, name);

export async function createProject(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = projectSchema.parse({
    name: form.get("name"),
    pitch: form.get("pitch") ?? "",
    engine: form.get("engine"),
    stage: form.get("stage"),
    visibility: form.get("visibility"),
    engagement: form.get("engagement"),
    genres: form.get("genres") ?? "",
  });
  const platforms = form.getAll("platforms").map(String).filter((p) => PLATFORMS.some((x) => x.id === p));
  const ownerSkill = String(form.get("ownerSkill") ?? "");
  const slug = await uniqueSlug(data.name);

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        name: data.name,
        pitch: data.pitch,
        engine: data.engine,
        stage: data.stage,
        visibility: data.visibility,
        engagement: data.engagement,
        platforms,
        genres: data.genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 8),
        ownerId: user.id,
      })
      .returning();
    await tx.insert(memberships).values({
      projectId: project.id,
      userId: user.id,
      role: "owner",
      skillId: isSkillId(ownerSkill) ? ownerSkill : null,
    });
    await createDefaultChannels(tx as unknown as typeof db, project.id);
    await tx.insert(milestones).values({ projectId: project.id, ...milestoneFor(data.stage) });
  });

  redirect(`/p/${slug}/workspace/general`);
}

export async function updateProject(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const data = projectSchema.omit({ name: true, engine: true, stage: true }).parse({
    pitch: form.get("pitch") ?? "",
    visibility: form.get("visibility"),
    engagement: form.get("engagement"),
    genres: form.get("genres") ?? "",
  });
  await db
    .update(projects)
    .set({
      pitch: data.pitch,
      visibility: data.visibility,
      engagement: data.engagement,
      genres: data.genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 8),
      platforms: form.getAll("platforms").map(String).filter((p) => PLATFORMS.some((x) => x.id === p)),
    })
    .where(eq(projects.id, project.id));
  revalidatePath(`/p/${slug}`);
}

// --- Recruiting ---------------------------------------------------------------------------

const listingSchema = z.object({
  skillId: z.string().refine(isSkillId, "Unknown skill"),
  title: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  engagement: z.enum(engagementIds),
  hoursPerWeek: z.coerce.number().int().min(1).max(80).optional(),
  compensation: z.string().trim().max(120),
});

export async function createListing(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const data = listingSchema.parse({
    skillId: form.get("skillId"),
    title: form.get("title") ?? "",
    description: form.get("description") ?? "",
    engagement: form.get("engagement"),
    hoursPerWeek: form.get("hoursPerWeek") || undefined,
    compensation: form.get("compensation") ?? "",
  });
  const [listing] = await db.insert(roleListings).values({ projectId: project.id, ...data, title: data.title || skillLabel(data.skillId) }).returning({ id: roleListings.id });
  // Saved-search alerts (C16) for people looking for exactly this kind of role.
  await alertForListing(db, listing.id);
  revalidatePath(`/p/${slug}/roles`);
}

export async function closeListing(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const id = z.string().uuid().parse(form.get("id"));
  await db
    .update(roleListings)
    .set({ status: "closed" })
    .where(and(eq(roleListings.id, id), eq(roleListings.projectId, project.id)));
  revalidatePath(`/p/${slug}/roles`);
}

export async function applyToListing(form: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = z.string().uuid().parse(form.get("listingId"));
  const message = z.string().trim().max(2000).parse(form.get("message") ?? "");
  const [row] = await db
    .select({ listing: roleListings, project: projects })
    .from(roleListings)
    .innerJoin(projects, eq(projects.id, roleListings.projectId))
    .where(eq(roleListings.id, listingId))
    .limit(1);
  if (!row || row.listing.status !== "open") throw new Error("This role is no longer open");
  const { role } = await loadProject(row.project.slug, user);
  if (role) throw new Error("You're already on this team");
  await db.insert(applications).values({ listingId, userId: user.id, message }).onConflictDoNothing();
  revalidatePath(`/p/${row.project.slug}`);
  redirect(`/p/${row.project.slug}?applied=1`);
}



export async function decideApplication(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const applicationId = z.string().uuid().parse(form.get("applicationId"));
  const decision = z.enum(["accept", "decline"]).parse(form.get("decision"));

  const [row] = await db
    .select({ application: applications, listing: roleListings, applicant: users })
    .from(applications)
    .innerJoin(roleListings, eq(roleListings.id, applications.listingId))
    .innerJoin(users, eq(users.id, applications.userId))
    .where(and(eq(applications.id, applicationId), eq(roleListings.projectId, project.id)))
    .limit(1);
  if (!row || row.application.status !== "pending") return;

  if (decision === "decline") {
    await db.update(applications).set({ status: "declined" }).where(eq(applications.id, applicationId));
    revalidatePath(`/p/${slug}/roles`);
    return;
  }

  const memberRole = row.listing.engagement === "paid" ? "contractor" : "member";
  await db.transaction(async (tx) => {
    await tx.update(applications).set({ status: "accepted" }).where(eq(applications.id, applicationId));
    await tx.update(roleListings).set({ status: "filled" }).where(eq(roleListings.id, row.listing.id));
    await tx
      .insert(memberships)
      .values({ projectId: project.id, userId: row.applicant.id, role: memberRole, skillId: row.listing.skillId })
      .onConflictDoNothing();
  });

  const general = await channelByName(db, project.id, "general");
  const notes = [`Welcome ${row.applicant.name} (@${row.applicant.handle}), joining as ${skillLabel(row.listing.skillId)}.`];
  if (memberRole === "contractor") {
    notes.push("Repo access will be granted once their contract is signed (Contracts tab).");
  } else {
    notes.push(...(await grantRepoAccess(db, project.id, row.applicant.githubLogin, GITHUB_PERMISSION[memberRole])));
  }
  if (general) await postMessage(db, { channelId: general.id, authorId: null, body: notes.join("\n") });
  await fireEvent(db, project.id, { type: "member_joined", vars: { actor: row.applicant.name, title: skillLabel(row.listing.skillId) } });
  revalidatePath(`/p/${slug}/roles`);
}


export async function leaveOrRemoveMember(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project, role } = await loadProject(slug, user, "guest");
  const userId = z.string().uuid().parse(form.get("userId"));
  if (userId !== user.id && !roleAtLeast(role, "lead")) throw new Error("Only leads can remove members");
  if (userId === project.ownerId) throw new Error("The owner can't be removed");
  const [removed] = await db.delete(memberships).where(and(eq(memberships.projectId, project.id), eq(memberships.userId, userId))).returning();
  if (!removed) return;
  if (removed.role === "guest") {
    // Guests never had repo access; just drop their channel and asset grants (C15).
    await revokeGuestGrants(db, project.id, userId);
    revalidatePath(`/p/${slug}`, "layout");
    if (userId === user.id) redirect("/projects");
    return;
  }

  // Offboarding revokes repo access at the same time (github-integration.md §6).
  const [member] = await db.select({ login: users.githubLogin, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const notes = [`${member?.name ?? "A member"} left the project.`];
  if (member?.login && githubConfigured()) {
    for (const repo of await db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id))) {
      try {
        await removeCollaborator(repo.installationId, repo.fullName, member.login);
        notes.push(`Removed @${member.login} from ${repo.fullName}.`);
      } catch (err) {
        notes.push(`Couldn't remove @${member.login} from ${repo.fullName}: ${(err as Error).message}. Remove them on GitHub.`);
      }
    }
  }
  const general = await channelByName(db, project.id, "general");
  if (general) await postMessage(db, { channelId: general.id, authorId: null, body: notes.join("\n") });
  revalidatePath(`/p/${slug}`);
  if (userId === user.id) redirect("/projects");
}
