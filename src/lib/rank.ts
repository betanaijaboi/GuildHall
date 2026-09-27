/**
 * Guild Rank (C1): a transparent reputation score built only from verifiable evidence on
 * Guildhall. Every input is shown with its points; nothing can be bought. Caps stop any single
 * activity from carrying a whole rank.
 */

export type RankInputs = {
  mergedPrs: number;
  approvedAssets: number;
  paidMilestones: number;
  pipelineStages: number;
  endorsements: number;
  credits: number;
  reviewRatings: number[];
};

export const RANKS = [
  { id: "apprentice", label: "Apprentice", min: 0, color: "#b08d57", gigSlots: 3 },
  { id: "journeyman", label: "Journeyman", min: 100, color: "#a8b3c7", gigSlots: 5 },
  { id: "artisan", label: "Artisan", min: 300, color: "#fbbf24", gigSlots: 8 },
  { id: "master", label: "Master", min: 700, color: "#a78bfa", gigSlots: 12 },
  { id: "grandmaster", label: "Grandmaster", min: 1300, color: "#22d3ee", gigSlots: 20 },
] as const;

export type Rank = (typeof RANKS)[number];

const RULES = [
  { key: "mergedPrs", label: "Merged pull requests", each: 10, cap: 300 },
  { key: "approvedAssets", label: "Assets approved in review", each: 15, cap: 300 },
  { key: "paidMilestones", label: "Paid milestones delivered", each: 25, cap: 500 },
  { key: "pipelineStages", label: "Pipeline stages completed", each: 5, cap: 200 },
  { key: "endorsements", label: "Skill endorsements from teammates", each: 10, cap: 200 },
  { key: "credits", label: "Verified or confirmed shipped credits", each: 20, cap: 200 },
] as const;

export type RankLine = { label: string; count: number; points: number; rule: string };

/** Review points: 5★ +30, 4★ +20, 3★ +10, 2★ 0, 1★ −10. */
export function reviewPoints(rating: number): number {
  return (Math.max(1, Math.min(5, Math.round(rating))) - 2) * 10;
}

export function computeRank(inputs: RankInputs) {
  const lines: RankLine[] = RULES.map((r) => {
    const count = inputs[r.key];
    return { label: r.label, count, points: Math.min(count * r.each, r.cap), rule: `${r.each} each, max ${r.cap}` };
  });
  const reviews = inputs.reviewRatings.reduce((n, r) => n + reviewPoints(r), 0);
  lines.push({ label: "Client & collaborator reviews", count: inputs.reviewRatings.length, points: reviews, rule: "5★ +30 … 1★ −10" });
  const points = Math.max(0, lines.reduce((n, l) => n + l.points, 0));
  const idx = RANKS.findLastIndex((r) => points >= r.min);
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const progress = next ? Math.round(((points - rank.min) / (next.min - rank.min)) * 100) : 100;
  const avgRating = inputs.reviewRatings.length ? inputs.reviewRatings.reduce((a, b) => a + b, 0) / inputs.reviewRatings.length : null;
  return { points, rank, next, progress, lines, avgRating };
}

export const EMPTY_INPUTS: RankInputs = { mergedPrs: 0, approvedAssets: 0, paidMilestones: 0, pipelineStages: 0, endorsements: 0, credits: 0, reviewRatings: [] };
