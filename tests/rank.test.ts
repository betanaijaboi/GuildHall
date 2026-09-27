import { describe, expect, it } from "vitest";
import { computeRank, EMPTY_INPUTS, reviewPoints } from "@/lib/rank";

describe("Guild Rank", () => {
  it("starts everyone as Apprentice", () => {
    const r = computeRank(EMPTY_INPUTS);
    expect(r.rank.label).toBe("Apprentice");
    expect(r.points).toBe(0);
    expect(r.next?.label).toBe("Journeyman");
  });

  it("adds capped evidence and shows every line", () => {
    const r = computeRank({ mergedPrs: 50, approvedAssets: 4, paidMilestones: 3, pipelineStages: 10, endorsements: 2, credits: 0, reviewRatings: [5, 4] });
    // PRs capped at 300; 60 + 75 + 50 + 20 + (30+20)
    expect(r.points).toBe(300 + 60 + 75 + 50 + 20 + 50);
    expect(r.rank.label).toBe("Artisan");
    expect(r.lines).toHaveLength(7);
    expect(r.lines[0]).toMatchObject({ count: 50, points: 300 });
    expect(r.avgRating).toBe(4.5);
  });

  it("scores reviews symmetrically around 2 stars and never goes negative overall", () => {
    expect([5, 4, 3, 2, 1].map(reviewPoints)).toEqual([30, 20, 10, 0, -10]);
    expect(computeRank({ ...EMPTY_INPUTS, reviewRatings: [1, 1] }).points).toBe(0);
  });

  it("reports progress to the next rank", () => {
    const r = computeRank({ ...EMPTY_INPUTS, mergedPrs: 5 });
    expect(r.progress).toBe(50);
    expect(computeRank({ ...EMPTY_INPUTS, mergedPrs: 30, approvedAssets: 20, paidMilestones: 20, pipelineStages: 40, endorsements: 20, credits: 0, reviewRatings: Array(10).fill(5) }).rank.label).toBe("Grandmaster");
  });
});
