import { describe, expect, it } from "vitest";
import { matches, parseRule, render, ruleSchema, TEMPLATES } from "@/lib/automations";

describe("automations", () => {
  it("templates are valid rules", () => {
    for (const t of TEMPLATES) expect(ruleSchema.safeParse(t).success).toBe(true);
  });

  it("matches triggers with filters", () => {
    expect(matches({ type: "ci_failed", branch: "main" }, { type: "ci_failed", branch: "main", vars: {} })).toBe(true);
    expect(matches({ type: "ci_failed", branch: "main" }, { type: "ci_failed", branch: "storm", vars: {} })).toBe(false);
    expect(matches({ type: "ci_failed", branch: null }, { type: "ci_failed", branch: "storm", vars: {} })).toBe(true);
    expect(matches({ type: "task_done", pipelineOnly: true }, { type: "task_done", pipeline: false, vars: {} })).toBe(false);
    expect(matches({ type: "weekly", day: 5, hourUtc: 16 }, { type: "weekly", day: 5, hourUtc: 16, vars: {} })).toBe(true);
    expect(matches({ type: "release_published" }, { type: "asset_approved", vars: {} })).toBe(false);
  });

  it("renders templates and leaves unknown placeholders visible", () => {
    expect(render("{title} by {actor} {url}", { title: "Dock", actor: "Ada" })).toBe("Dock by Ada {url}");
  });

  it("parses plain English into rules", () => {
    expect(parseRule("When CI fails on main, ping @amara in #builds")).toMatchObject({
      trigger: { type: "ci_failed", branch: "main" }, action: { type: "post_message", channel: "builds", mention: "amara" },
    });
    expect(parseRule("every friday at 4pm post the weekly digest")).toMatchObject({ trigger: { type: "weekly", day: 5, hourUtc: 16 }, action: { type: "post_digest", channel: "general" } });
    expect(parseRule("when a release is published draft a devlog")).toMatchObject({ trigger: { type: "release_published" }, action: { type: "draft_devlog" } });
    expect(parseRule("when art is submitted notify @lukas")).toMatchObject({ trigger: { type: "asset_submitted" }, action: { channel: "art", mention: "lukas" } });
    expect(parseRule("make it nice")).toBeNull();
    for (const s of ["When CI fails on main, ping @amara in #builds", "every friday at 4pm post the weekly digest"]) expect(ruleSchema.safeParse(parseRule(s)).success).toBe(true);
  });
});
