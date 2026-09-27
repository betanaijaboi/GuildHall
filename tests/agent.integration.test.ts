import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { recordAgentAssignment } from "@/lib/agent-db";
import { applyWebhook } from "@/lib/github/apply";
import { channelByName, createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema }) as unknown as Db;
const s = schema;
const REPO = 5151;
let projectId = "", lead = "", agentTask = "", plainTask = "";

beforeAll(async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, github_installations, github_deliveries restart identity cascade`;
  [{ id: lead }] = await db.insert(s.users).values({ handle: "lead", name: "Lead" }).returning();
  const [p] = await db.insert(s.projects).values({ slug: "agent", name: "Agent", engine: "godot", ownerId: lead }).returning();
  projectId = p.id;
  await createDefaultChannels(db, projectId);
  await db.insert(s.githubInstallations).values({ id: 77, accountLogin: "s", accountType: "User" });
  await db.insert(s.projectRepos).values({ projectId, installationId: 77, repoId: REPO, fullName: "s/agent" });
  [{ id: agentTask }] = await db.insert(s.tasks).values({ projectId, title: "Fix dock shader" }).returning();
  [{ id: plainTask }] = await db.insert(s.tasks).values({ projectId, title: "Human task", ghRepoId: REPO, ghIssueNumber: 13, ghUrl: "https://i/13" }).returning();
});
afterAll(async () => client.end());

const repository = { id: REPO, full_name: "s/agent" };

describe("AI agent round trip", () => {
  it("keeps the lead's task when the issue webhook got there first", async () => {
    // The "issues.opened" webhook for the new issue can race the assignment and create a task.
    await applyWebhook(db, "i1", "issues", { action: "opened", repository, sender: { login: "guildhall[bot]" }, issue: { number: 12, title: "Fix dock shader", body: "brief", state: "open", html_url: "https://i/12", assignee: null } });
    expect((await db.select().from(s.tasks).where(eq(s.tasks.projectId, projectId))).length).toBe(3);
    await recordAgentAssignment(db, agentTask, REPO, { number: 12, url: "https://i/12" }, lead);
    const rows = await db.select().from(s.tasks).where(eq(s.tasks.projectId, projectId));
    expect(rows.length).toBe(2);
    expect(rows.find((t) => t.id === agentTask)).toMatchObject({ ghIssueNumber: 12, agentStatus: "requested", agentRequestedBy: lead });
  });

  it("follows the agent's PR to merge, and completes the task when the issue closes", async () => {
    const pr = { number: 8, title: "Fix dock shader", body: "Fixes #12\nAlso fixes #13", html_url: "https://pr/8", state: "open", draft: false, head: { ref: "claude/issue-12-1" } };
    await applyWebhook(db, "p1", "pull_request", { action: "opened", repository, sender: { login: "claude[bot]" }, pull_request: pr });
    let [t] = await db.select().from(s.tasks).where(eq(s.tasks.id, agentTask));
    expect(t).toMatchObject({ agentStatus: "pr_open", agentPrUrl: "https://pr/8" });
    // A human-owned task mentioned by the same PR isn't turned into an agent task.
    const [plain] = await db.select().from(s.tasks).where(eq(s.tasks.id, plainTask));
    expect(plain.agentStatus).toBeNull();
    const code = (await channelByName(db, projectId, "code"))!;
    const msgs = await db.select().from(s.messages).where(eq(s.messages.channelId, code.id));
    expect(msgs.some((m) => m.body.startsWith('🤖 AI agent opened a PR for "Fix dock shader"'))).toBe(true);

    await applyWebhook(db, "p2", "pull_request", { action: "closed", repository, sender: { login: "lead" }, pull_request: { ...pr, state: "closed", merged: true } });
    await applyWebhook(db, "i2", "issues", { action: "closed", repository, sender: { login: "lead" }, issue: { number: 12, title: "Fix dock shader", body: "brief", state: "closed", html_url: "https://i/12", assignee: null } });
    [t] = await db.select().from(s.tasks).where(eq(s.tasks.id, agentTask));
    expect(t).toMatchObject({ agentStatus: "merged", status: "done" });
  });
});
