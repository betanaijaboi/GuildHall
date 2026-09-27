import { sign } from "@octokit/webhooks-methods";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { applyWebhook } from "@/lib/github/apply";
import { createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const { users, projects, memberships, githubInstallations, projectRepos, messages, tasks, channels, githubActivity } = schema;
const repository = { id: 900, full_name: "studio/game" };
let projectId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client`truncate users, projects, github_installations, github_deliveries restart identity cascade`;
  const [owner] = await db.insert(users).values({ handle: "owner", name: "Owner" }).returning();
  await db.insert(users).values({ handle: "lukas", name: "Lukas", githubLogin: "lukas-gh" });
  const [p] = await db.insert(projects).values({ slug: "game", name: "Game", engine: "godot", ownerId: owner.id }).returning();
  projectId = p.id;
  await db.insert(memberships).values({ projectId, userId: owner.id, role: "owner" });
  await createDefaultChannels(db, projectId);
  await db.insert(githubInstallations).values({ id: 77, accountLogin: "studio", accountType: "Organization" });
  await db.insert(projectRepos).values({ projectId, installationId: 77, repoId: repository.id, fullName: repository.full_name });
});

const channelMessages = async (name: string) =>
  db
    .select({ body: messages.body, threadRootId: messages.threadRootId, id: messages.id })
    .from(messages)
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .where(and(eq(channels.projectId, projectId), eq(channels.name, name)))
    .orderBy(messages.createdAt);

describe("applyWebhook", () => {
  it("is idempotent per delivery id", async () => {
    const payload = { ref: "refs/heads/main", repository, pusher: { name: "mei" }, commits: [{ message: "a" }] };
    expect(await applyWebhook(db, "d1", "push", payload)).toMatchObject({ duplicate: false, projects: 1 });
    expect(await applyWebhook(db, "d1", "push", payload)).toMatchObject({ duplicate: true });
    expect(await channelMessages("github")).toHaveLength(1);
    expect(await db.select().from(githubActivity)).toHaveLength(1);
  });

  it("threads PR events under the first PR message", async () => {
    const pr = { number: 5, title: "Storms", html_url: "https://pr", state: "open", merged: false };
    await applyWebhook(db, "a", "pull_request", { action: "opened", repository, sender: { login: "mei" }, pull_request: pr });
    await applyWebhook(db, "b", "pull_request_review", { action: "submitted", repository, sender: { login: "j" }, review: { state: "approved" }, pull_request: pr });
    await applyWebhook(db, "c", "pull_request", { action: "closed", repository, sender: { login: "mei" }, pull_request: { ...pr, merged: true } });
    const [root, ...replies] = await channelMessages("github");
    expect(root.threadRootId).toBeNull();
    expect(replies).toHaveLength(2);
    expect(replies.every((r) => r.threadRootId === root.id)).toBe(true);
    const [rootRow] = await db.select({ card: messages.card }).from(messages).where(eq(messages.id, root.id));
    expect(rootRow.card?.state).toBe("merged");
  });

  it("syncs issues into tasks: assign, close, reopen", async () => {
    const issue = { number: 9, title: "Harbour", body: "b", html_url: "https://i", state: "open", assignee: { login: "lukas-gh" } };
    await applyWebhook(db, "i1", "issues", { action: "opened", repository, sender: { login: "o" }, issue });
    let [task] = await db.select().from(tasks);
    expect(task).toMatchObject({ title: "Harbour", status: "todo", ghIssueNumber: 9 });
    expect(task.assigneeId).not.toBeNull();

    await db.update(tasks).set({ status: "doing" });
    await applyWebhook(db, "i2", "issues", { action: "edited", repository, issue: { ...issue, title: "Harbour v2" } });
    [task] = await db.select().from(tasks);
    expect(task).toMatchObject({ title: "Harbour v2", status: "doing" });

    await applyWebhook(db, "i3", "issues", { action: "closed", repository, sender: { login: "o" }, issue: { ...issue, state: "closed" } });
    [task] = await db.select().from(tasks);
    expect(task.status).toBe("done");
    expect(task.completedAt).not.toBeNull();

    await applyWebhook(db, "i4", "issues", { action: "reopened", repository, sender: { login: "o" }, issue });
    [task] = await db.select().from(tasks);
    expect(task).toMatchObject({ status: "todo", completedAt: null });
    expect(await db.select().from(tasks).where(isNotNull(tasks.ghIssueNumber))).toHaveLength(1);
  });

  it("unlinks repos removed from the installation and drops deleted installations", async () => {
    await applyWebhook(db, "r1", "installation_repositories", { action: "removed", installation: { id: 77 }, repositories_removed: [{ id: 900 }] });
    expect(await db.select().from(projectRepos)).toHaveLength(0);
    await applyWebhook(db, "r2", "installation", { action: "deleted", installation: { id: 77 } });
    expect(await db.select().from(githubInstallations)).toHaveLength(0);
  });

  it("warns #art once per week when two people push the same unmergeable file", async () => {
    const push = (who: string, branch: string) => ({
      ref: `refs/heads/${branch}`, repository, pusher: { name: who }, commits: [{ message: "edit", modified: ["Content/Maps/Harbour.umap"] }],
    });
    await applyWebhook(db, "c1", "push", push("ada", "main"));
    expect((await channelMessages("art")).filter((m) => m.body.includes("Conflict risk"))).toHaveLength(0);
    await applyWebhook(db, "c2", "push", push("mei", "storm"));
    await applyWebhook(db, "c3", "push", push("ada", "main"));
    const warnings = (await channelMessages("art")).filter((m) => m.body.includes("Conflict risk"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].body).toContain("different branches");
  });

  it("ignores events for repos no project links", async () => {
    const result = await applyWebhook(db, "x", "push", { repository: { id: 1, full_name: "other/repo" }, commits: [{ message: "a" }] });
    expect(result.projects).toBe(0);
  });
});

describe("POST /api/github/webhook", () => {
  const call = async (body: string, signature: string | null, delivery = "route-1") => {
    const { POST } = await import("@/app/api/github/webhook/route");
    const headers: Record<string, string> = { "x-github-event": "push", "x-github-delivery": delivery };
    if (signature) headers["x-hub-signature-256"] = signature;
    return POST(new NextRequest("http://localhost/api/github/webhook", { method: "POST", body, headers }));
  };
  const body = JSON.stringify({ ref: "refs/heads/main", repository, pusher: { name: "mei" }, commits: [{ message: "a" }] });

  it("rejects missing or wrong signatures", async () => {
    expect((await call(body, null)).status).toBe(401);
    expect((await call(body, await sign("wrong-secret", body))).status).toBe(401);
  });

  it("accepts a correctly signed delivery", async () => {
    const res = await call(body, await sign("test-webhook-secret", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: false, projects: 1 });
  });
});
