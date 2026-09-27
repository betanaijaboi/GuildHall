"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { feedbackKeys, feedbackReports, playtests, projectRepos } from "@/db/schema";
import type { SecretState } from "@/app/actions/guests";
import { loadProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { env, githubConfigured } from "@/lib/env";
import { hashKey, issueBody, newFeedbackKey, parseQuestions } from "@/lib/feedback";
import { joinPlaytest, reportToTask, submitPlaytestFeedback } from "@/lib/feedback-db";
import { createIssue } from "@/lib/github/client";

const httpsUrl = z.string().trim().url().refine((u) => u.startsWith("https://"), "Use an https link").or(z.literal(""));

export async function createPlaytest(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const data = z
    .object({ title: z.string().trim().min(3).max(120), description: z.string().trim().max(4000), buildUrl: httpsUrl, maxTesters: z.coerce.number().int().min(1).max(10_000) })
    .parse({ title: form.get("title"), description: form.get("description") ?? "", buildUrl: form.get("buildUrl") ?? "", maxTesters: form.get("maxTesters") ?? 50 });
  const questions = parseQuestions(String(form.get("questions") ?? ""));
  await db.insert(playtests).values({ ...data, buildUrl: data.buildUrl || null, questions, projectId: project.id, createdBy: user.id });
  revalidatePath(`/p/${slug}`, "layout");
}

export async function setPlaytestOpen(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await db.update(playtests).set({ open: form.get("open") === "1" }).where(and(eq(playtests.id, z.string().uuid().parse(form.get("id"))), eq(playtests.projectId, project.id)));
  revalidatePath(`/p/${slug}`, "layout");
}

async function loadPlaytest(slug: string, id: string) {
  const user = await requireUser();
  const { project } = await loadProject(slug, user);
  const [pt] = await db.select().from(playtests).where(and(eq(playtests.id, z.string().uuid().parse(id)), eq(playtests.projectId, project.id))).limit(1);
  if (!pt) throw new Error("Playtest not found");
  return { user, project, pt };
}

export async function joinPlaytestAction(slug: string, id: string, form: FormData): Promise<void> {
  const { user, pt } = await loadPlaytest(slug, id);
  await joinPlaytest(db, pt.id, user.id, z.string().max(40).parse(form.get("platform") ?? ""));
  revalidatePath(`/p/${slug}/playtest/${id}`);
}

export async function submitPlaytestFeedbackAction(slug: string, id: string, form: FormData): Promise<void> {
  const { user, pt } = await loadPlaytest(slug, id);
  const answers = Object.fromEntries(pt.questions.map((q) => [q.id, form.get(q.id)]));
  await submitPlaytestFeedback(db, pt, user, {
    kind: z.enum(["bug", "feedback", "idea"]).parse(form.get("kind") ?? "feedback"),
    title: z.string().max(160).parse(form.get("title") ?? ""),
    body: z.string().max(8000).parse(form.get("body") ?? ""),
    platform: z.string().max(80).parse(form.get("platform") ?? ""),
    answers,
  });
  redirect(`/p/${slug}/playtest/${id}?thanks=1`);
}

// --- Triage (team) ------------------------------------------------------------------------------

async function loadReport(slug: string, form: FormData) {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "member");
  const [r] = await db.select().from(feedbackReports).where(and(eq(feedbackReports.id, z.string().uuid().parse(form.get("id"))), eq(feedbackReports.projectId, project.id))).limit(1);
  if (!r) throw new Error("Report not found");
  return { user, project, r };
}

export async function reportToIssueAction(slug: string, form: FormData): Promise<void> {
  const { project, r } = await loadReport(slug, form);
  if (r.issueUrl) return;
  if (!githubConfigured()) throw new Error("GitHub isn't configured on this server");
  const [repo] = await db.select().from(projectRepos).where(eq(projectRepos.projectId, project.id)).limit(1);
  if (!repo) throw new Error("Link a GitHub repo first");
  const [pt] = r.playtestId ? await db.select().from(playtests).where(eq(playtests.id, r.playtestId)).limit(1) : [];
  const issue = await createIssue(repo.installationId, repo.fullName, `${r.kind === "bug" ? "[Bug] " : ""}${r.title}`.slice(0, 200), issueBody(r, pt?.questions ?? [], `${env.appUrl}/p/${slug}/playtests#${r.id}`), [r.kind === "bug" ? "bug" : "player-feedback"]);
  await db.update(feedbackReports).set({ status: "issue", issueUrl: issue.url }).where(eq(feedbackReports.id, r.id));
  revalidatePath(`/p/${slug}/playtests`);
}

export async function reportToTaskAction(slug: string, form: FormData): Promise<void> {
  const { project, r } = await loadReport(slug, form);
  await reportToTask(db, r.id, project.id, `${env.appUrl}/p/${slug}/playtests#${r.id}`);
  revalidatePath(`/p/${slug}/playtests`);
  revalidatePath(`/p/${slug}/tasks`);
}

export async function setReportDismissed(slug: string, form: FormData): Promise<void> {
  const { r } = await loadReport(slug, form);
  const dismiss = form.get("dismiss") === "1";
  if (!dismiss && r.status !== "dismissed") return;
  await db.update(feedbackReports).set({ status: dismiss ? "dismissed" : r.issueUrl ? "issue" : r.taskId ? "task" : "new" }).where(eq(feedbackReports.id, r.id));
  revalidatePath(`/p/${slug}/playtests`);
}

// --- In-game reporter keys --------------------------------------------------------------------------

export async function createFeedbackKeyAction(slug: string, _prev: SecretState, form: FormData): Promise<SecretState> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  const label = z.string().trim().min(1).max(60).safeParse(form.get("label"));
  if (!label.success) return { error: "Name the key, e.g. \"Steam demo build\"" };
  const key = newFeedbackKey();
  await db.insert(feedbackKeys).values({ keyHash: hashKey(key), projectId: project.id, label: label.data, prefix: key.slice(0, 10), createdBy: user.id });
  revalidatePath(`/p/${slug}/playtests`);
  return { secret: key };
}

export async function revokeFeedbackKey(slug: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const { project } = await loadProject(slug, user, "lead");
  await db.delete(feedbackKeys).where(and(eq(feedbackKeys.keyHash, z.string().regex(/^[0-9a-f]{64}$/).parse(form.get("keyHash"))), eq(feedbackKeys.projectId, project.id)));
  revalidatePath(`/p/${slug}/playtests`);
}
