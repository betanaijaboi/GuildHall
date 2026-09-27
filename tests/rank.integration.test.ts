import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { loadRankInputs, rankOf, sharesProject } from "@/lib/rank-db";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const s = schema;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client`truncate users, projects, github_installations, github_deliveries, payment_events restart identity cascade`;
});
afterAll(async () => client.end());

describe("rank inputs", () => {
  it("counts only verified evidence per person", async () => {
    const [a] = await db.insert(s.users).values({ handle: "ada", name: "Ada", githubLogin: "ada-gh" }).returning();
    const [b] = await db.insert(s.users).values({ handle: "bo", name: "Bo" }).returning();
    const [c] = await db.insert(s.users).values({ handle: "cy", name: "Cy" }).returning();
    const [p] = await db.insert(s.projects).values({ slug: "r", name: "R", engine: "godot", ownerId: a.id }).returning();
    await db.insert(s.memberships).values([{ projectId: p.id, userId: a.id, role: "owner" }, { projectId: p.id, userId: b.id, role: "member" }]);

    await db.insert(s.githubActivity).values([
      { projectId: p.id, kind: "pr_merged", actorLogin: "ada-gh", title: "x" },
      { projectId: p.id, kind: "pr_merged", actorLogin: "ada-gh", title: "y" },
      { projectId: p.id, kind: "pr_opened", actorLogin: "ada-gh", title: "z" },
    ]);
    const [asset] = await db.insert(s.assets).values({ projectId: p.id, title: "Boat", kind: "image" }).returning();
    const [v1] = await db.insert(s.assetVersions).values({ assetId: asset.id, version: 1, fileKey: "k", mime: "image/png", size: 1, uploadedBy: b.id }).returning();
    await db.insert(s.assetReviews).values([
      { assetId: asset.id, versionId: v1.id, reviewerId: a.id, decision: "approved" },
      { assetId: asset.id, versionId: v1.id, reviewerId: a.id, decision: "approved" },
    ]);
    await db.insert(s.endorsements).values({ fromId: a.id, toId: b.id, skillId: "art.concept" });

    const inputs = await loadRankInputs(db, [a.id, b.id, c.id]);
    expect(inputs.get(a.id)).toMatchObject({ mergedPrs: 2, approvedAssets: 0 });
    expect(inputs.get(b.id)).toMatchObject({ approvedAssets: 1, endorsements: 1, mergedPrs: 0 });
    expect((await rankOf(db, b.id)).points).toBe(25);
    expect(await sharesProject(db, a.id, b.id)).toBe(true);
    expect(await sharesProject(db, a.id, c.id)).toBe(false);
  });
});
