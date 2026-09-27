import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { runWeekly } from "@/lib/automations-db";
import { applyWebhook } from "@/lib/github/apply";
import { createDefaultChannels } from "@/lib/messages";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const s = schema;
let projectId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, github_installations, github_deliveries, payment_events restart identity cascade`;
  const [u] = await db.insert(s.users).values({ handle: "o", name: "O" }).returning();
  const [p] = await db.insert(s.projects).values({ slug: "auto", name: "Auto", engine: "godot", ownerId: u.id }).returning();
  projectId = p.id;
  await createDefaultChannels(db, p.id);
  await db.insert(s.githubInstallations).values({ id: 9, accountLogin: "s", accountType: "User" });
  await db.insert(s.projectRepos).values({ projectId, installationId: 9, repoId: 4242, fullName: "s/auto" });
  await db.insert(s.automations).values([
    { projectId, name: "main red", trigger: { type: "ci_failed", branch: "main" }, action: { type: "post_message", channel: "builds", text: "main is red: {title} {url}", mention: "o" } },
    { projectId, name: "devlog", trigger: { type: "release_published" }, action: { type: "draft_devlog" } },
    { projectId, name: "friday digest", trigger: { type: "weekly", day: 5, hourUtc: 16 }, action: { type: "post_digest", channel: "general" } },
    { projectId, name: "disabled", enabled: false, trigger: { type: "release_published" }, action: { type: "post_message", channel: "general", text: "should not fire", mention: null } },
  ]);
});
afterAll(async () => client.end());

const bodies = async (channel: string) =>
  (await db.select({ body: s.messages.body }).from(s.messages).innerJoin(s.channels, eq(s.channels.id, s.messages.channelId)).where(and(eq(s.channels.projectId, projectId), eq(s.channels.name, channel)))).map((r) => r.body);

describe("automation runner", () => {
  it("fires on matching GitHub events only", async () => {
    const repository = { id: 4242, full_name: "s/auto" };
    const run = (branch: string) => ({ action: "completed", repository, workflow_run: { name: "CI", conclusion: "failure", head_branch: branch, html_url: "https://run", head_commit: { message: "x" }, actor: { login: "a" } } });
    await applyWebhook(db, "a1", "workflow_run", run("storm"));
    expect((await bodies("builds")).filter((b) => b.startsWith("@o main is red"))).toHaveLength(0);
    await applyWebhook(db, "a2", "workflow_run", run("main"));
    expect((await bodies("builds")).filter((b) => b.startsWith("@o main is red: CI https://run"))).toHaveLength(1);

    await applyWebhook(db, "a3", "release", { action: "published", repository, sender: { login: "a" }, release: { name: "v1.0", tag_name: "v1.0", html_url: "https://rel", assets: [] } });
    const drafts = await db.select().from(s.posts).where(eq(s.posts.projectId, projectId));
    expect(drafts.map((d) => d.title)).toEqual(["Draft: v1.0"]);
    expect((await bodies("general")).some((b) => b === "should not fire")).toBe(false);
    const [rule] = await db.select().from(s.automations).where(eq(s.automations.name, "main red"));
    expect(rule.fireCount).toBe(1);
  });

  it("runs weekly rules once per week at their hour", async () => {
    const friday4pm = new Date("2026-10-02T16:10:00Z");
    expect(await runWeekly(db, new Date("2026-10-02T15:10:00Z"))).toBe(0);
    expect(await runWeekly(db, friday4pm)).toBe(1);
    expect(await runWeekly(db, friday4pm)).toBe(0);
    expect((await bodies("general")).filter((b) => b.startsWith("Weekly digest"))).toHaveLength(1);
  });
});
