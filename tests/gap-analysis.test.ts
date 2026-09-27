import { describe, expect, it } from "vitest";
import { rankCandidates, teamGaps } from "@/lib/gap-analysis";

describe("teamGaps", () => {
  it("splits core skills into covered, recruiting and missing", () => {
    const gaps = teamGaps(
      "prototype",
      [{ userId: "a", skillIds: ["design.systems", "narrative.writing"] }],
      ["engineering.gameplay"],
    );
    expect(gaps.covered).toEqual(["design.systems"]);
    expect(gaps.recruiting).toEqual(["engineering.gameplay"]);
    expect(gaps.missing).toEqual([]);
  });

  it("reports everything missing for an empty team", () => {
    expect(teamGaps("vertical_slice", []).missing).toContain("art.environment");
  });
});

describe("rankCandidates", () => {
  it("prefers skill overlap, then engine, and drops busy or irrelevant people", () => {
    const ranked = rankCandidates(["art.environment", "art.lighting"], "godot", [
      { userId: "unity-both", skillIds: ["art.environment", "art.lighting"], engines: ["unity"], availability: "open" },
      { userId: "godot-one", skillIds: ["art.environment"], engines: ["godot"], availability: "open" },
      { userId: "busy", skillIds: ["art.environment", "art.lighting"], engines: ["godot"], availability: "busy" },
      { userId: "coder", skillIds: ["engineering.gameplay"], engines: ["godot"], availability: "open" },
    ]);
    expect(ranked.map((c) => c.userId)).toEqual(["unity-both", "godot-one"]);
  });
});
