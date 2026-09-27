import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createDefaultChannels } from "@/lib/messages";
import { applyWebhook } from "@/lib/github/apply";
import { completeCurrentStage, stageTasks } from "@/lib/pipeline-db";
import { templateById } from "@/lib/pipelines";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const { users, projects, pipelineItems, tasks, messages, channels } = schema;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, github_installations, github_deliveries restart identity cascade`;
});
afterAll(async () => client.end());

describe("asset pipelines", () => {
  it("completes stages in order and announces who's next in the thread", async () => {
    const [owner] = await db.insert(users).values({ handle: "o", name: "Owner" }).returning();
    const [sculptor] = await db.insert(users).values({ handle: "sculptor", name: "Sam" }).returning();
    const [p] = await db.insert(projects).values({ slug: "pp", name: "P", engine: "godot", ownerId: owner.id }).returning();
    await createDefaultChannels(db, p.id);
    const t = templateById("character")!;
    const [item] = await db.insert(pipelineItems).values({ projectId: p.id, name: "Mara", template: t.id, stages: t.stages }).returning();
    await db.insert(tasks).values(t.stages.map((s, i) => ({ projectId: p.id, title: `Mara: ${s}`, pipelineItemId: item.id, stageIndex: i, assigneeId: i === 1 ? sculptor.id : null })));

    expect(await completeCurrentStage(db, p.id, item.id)).toBe(true);
    await completeCurrentStage(db, p.id, item.id);
    const stages = await stageTasks(db, item.id);
    expect(stages.map((s) => s.status).slice(0, 3)).toEqual(["done", "done", "todo"]);

    const art = await db.select({ body: messages.body, root: messages.threadRootId }).from(messages).innerJoin(channels, eq(channels.id, messages.channelId)).where(and(eq(channels.projectId, p.id), eq(channels.name, "art"))).orderBy(messages.createdAt);
    expect(art[0].body).toContain("Concept is done. Sculpt is unlocked, @sculptor you're up");
    expect(art[1].root).not.toBeNull();

    // Stage 3 is mirrored to GitHub issue #30; closing it there completes the stage and announces.
    await db.insert(schema.githubInstallations).values({ id: 5, accountLogin: "s", accountType: "User" });
    await db.insert(schema.projectRepos).values({ projectId: p.id, installationId: 5, repoId: 77, fullName: "s/g" });
    await db.update(tasks).set({ ghRepoId: 77, ghIssueNumber: 30 }).where(eq(tasks.id, stages[2].id));
    await applyWebhook(db, "pipe-1", "issues", {
      action: "closed", repository: { id: 77, full_name: "s/g" }, sender: { login: "x" },
      issue: { number: 30, title: "Mara: Retopo", body: "", html_url: "https://i", state: "closed", assignee: null },
    });
    expect((await stageTasks(db, item.id))[2].status).toBe("done");
    const after = await db.select({ body: messages.body }).from(messages).where(eq(messages.body, "Mara: Retopo is done. UV & texture is unlocked."));
    expect(after).toHaveLength(1);

    for (let i = 3; i < t.stages.length; i++) await completeCurrentStage(db, p.id, item.id);
    expect(await completeCurrentStage(db, p.id, item.id)).toBe(false);
  });
});
