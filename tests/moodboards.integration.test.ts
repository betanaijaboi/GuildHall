import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

const client = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });
const s = schema;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client`truncate users, projects restart identity cascade`;
});
afterAll(async () => client.end());

describe("moodboard storage", () => {
  it("pins a portfolio piece once per board and cleans up when the piece is deleted", async () => {
    const [artist] = await db.insert(s.users).values({ handle: "art", name: "Art" }).returning();
    const [p] = await db.insert(s.projects).values({ slug: "mb", name: "MB", engine: "godot", ownerId: artist.id }).returning();
    const [board] = await db.insert(s.moodboards).values({ projectId: p.id, name: "Harbour" }).returning();
    const [piece] = await db.insert(s.portfolioItems).values({ userId: artist.id, title: "Dock", url: "https://artstation.com/x", imageUrl: "https://cdn/x.jpg" }).returning();
    await db.insert(s.moodboardItems).values({ boardId: board.id, kind: "portfolio", portfolioItemId: piece.id }).onConflictDoNothing();
    await db.insert(s.moodboardItems).values({ boardId: board.id, kind: "portfolio", portfolioItemId: piece.id }).onConflictDoNothing();
    await db.insert(s.moodboardItems).values([{ boardId: board.id, kind: "color", color: "#1d4e89" }, { boardId: board.id, kind: "note", caption: "a" }, { boardId: board.id, kind: "note", caption: "b" }]);
    expect(await db.select().from(s.moodboardItems).where(eq(s.moodboardItems.boardId, board.id))).toHaveLength(4);
    await db.delete(s.portfolioItems).where(eq(s.portfolioItems.id, piece.id));
    expect(await db.select().from(s.moodboardItems).where(eq(s.moodboardItems.boardId, board.id))).toHaveLength(3);
    await db.delete(s.moodboards).where(eq(s.moodboards.id, board.id));
    expect(await db.select().from(s.moodboardItems)).toHaveLength(0);
  });
});
