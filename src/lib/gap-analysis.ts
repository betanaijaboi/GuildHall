import { STAGE_CORE_SKILLS } from "./stages";
import type { StageId } from "./taxonomy";

export type TeamMemberSkills = { userId: string; skillIds: string[] };

/**
 * Which core specialisations for `stage` nobody on the team covers.
 * A member covers a skill if it is their project role or one of their profile skills.
 * Skills with an open role listing are reported separately so the UI can say "already recruiting".
 */
export function teamGaps(
  stage: StageId,
  team: TeamMemberSkills[],
  openListingSkillIds: string[] = [],
): { missing: string[]; recruiting: string[]; covered: string[] } {
  const covered = new Set(team.flatMap((m) => m.skillIds));
  const listed = new Set(openListingSkillIds);
  const core = STAGE_CORE_SKILLS[stage];
  return {
    covered: core.filter((s) => covered.has(s)),
    recruiting: core.filter((s) => !covered.has(s) && listed.has(s)),
    missing: core.filter((s) => !covered.has(s) && !listed.has(s)),
  };
}

export type Candidate = { userId: string; skillIds: string[]; engines: string[]; availability: string };

/** Rank candidates for a set of missing skills: skill overlap first, then engine match, then availability. */
export function rankCandidates(missing: string[], engine: string, candidates: Candidate[]): Candidate[] {
  const wanted = new Set(missing);
  const availabilityScore: Record<string, number> = { open: 2, limited: 1, busy: 0 };
  const score = (c: Candidate) =>
    c.skillIds.filter((s) => wanted.has(s)).length * 10 +
    (c.engines.includes(engine) ? 3 : 0) +
    (availabilityScore[c.availability] ?? 0);
  return candidates
    .filter((c) => c.skillIds.some((s) => wanted.has(s)) && c.availability !== "busy")
    .sort((a, b) => score(b) - score(a));
}
