import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { profileSkills, users } from "@/db/schema";
import { computeRank } from "./rank";
import { loadRankInputs } from "./rank-db";

export type PeopleFilters = { q?: string; skill?: string; discipline?: string; engine?: string; availability?: string; engagement?: string };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchPeople(db: Db, f: PeopleFilters, limit = 50) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q.trim())}%`;
    where.push(
      or(
        ilike(users.name, like),
        ilike(users.handle, like),
        ilike(users.headline, like),
        sql`array_to_string(${users.tools}, ' ') ilike ${like}`,
      )!,
    );
  }
  if (f.skill) {
    where.push(sql`exists (select 1 from ${profileSkills} where "profile_skills"."user_id" = "users"."id" and ${profileSkills.skillId} = ${f.skill})`);
  }
  if (f.discipline && /^[a-z]+$/.test(f.discipline)) {
    where.push(sql`exists (select 1 from ${profileSkills} where "profile_skills"."user_id" = "users"."id" and ${profileSkills.skillId} like ${`${f.discipline}.%`})`);
  }
  if (f.engine) where.push(sql`${users.engines} @> array[${f.engine}]::text[]`);
  if (f.engagement) where.push(sql`${users.engagements} @> array[${f.engagement}]::text[]`);
  if (f.availability === "open" || f.availability === "limited" || f.availability === "busy") {
    where.push(eq(users.availability, f.availability));
  }

  const people = await db
    .select()
    .from(users)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(limit);
  const skills = people.length
    ? await db.select().from(profileSkills).where(inArray(profileSkills.userId, people.map((p) => p.id)))
    : [];
  const ranks = await loadRankInputs(db, people.map((p) => p.id));
  return people.map((p) => ({
    ...p,
    skillIds: skills.filter((s) => s.userId === p.id).map((s) => s.skillId),
    rank: computeRank(ranks.get(p.id)!).rank,
  }));
}
