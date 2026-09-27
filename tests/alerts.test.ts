import { describe, expect, it } from "vitest";
import { digestDue, digestEmail, isoWeekKey, matchesSearch, roleFit } from "@/lib/alerts";

describe("alerts", () => {
  it("matches saved searches on any combination of filters", () => {
    const r = { skillId: "narrative.writing", engine: "godot", stage: "prototype" };
    expect(matchesSearch({ skill: "narrative.writing", engine: null, stage: null }, r)).toBe(true);
    expect(matchesSearch({ skill: "narrative.writing", engine: "unity", stage: null }, r)).toBe(false);
    expect(matchesSearch({ skill: null, engine: "godot", stage: "prototype" }, r)).toBe(true);
  });
  it("scores role fit by skill, discipline and engine", () => {
    const me = { skills: ["narrative.writing"], engines: ["godot"] };
    expect(roleFit(me, { skillId: "narrative.writing", engine: "godot", stage: "x" })).toBe(4);
    expect(roleFit(me, { skillId: "narrative.worldbuilding", engine: "unity", stage: "x" })).toBe(1);
    expect(roleFit(me, { skillId: "art.pixel", engine: "godot", stage: "x" })).toBe(1);
  });
  it("keys digests by ISO week and spaces them a week apart", () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    expect(isoWeekKey(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    expect(isoWeekKey(new Date(Date.UTC(2026, 8, 27)))).toBe("2026-W39");
    const now = new Date(Date.UTC(2026, 8, 27, 12));
    expect(digestDue(null, now)).toBe(true);
    expect(digestDue(new Date(now.getTime() - 6 * 86_400_000), now)).toBe(false);
    expect(digestDue(new Date(now.getTime() - 7 * 86_400_000 + 1000), now)).toBe(true);
  });
  it("escapes names and links in digest email", () => {
    const e = digestEmail("<Sam>", [{ heading: "Roles for you", lines: [{ text: "Writer <b>", url: "/p/x" }] }], "https://gh.io");
    expect(e.subject).toBe("Your Guildhall week: 1 roles for you");
    expect(e.html).toContain("Hi &lt;Sam&gt;");
    expect(e.html).toContain("Writer &lt;b&gt;");
    expect(e.text).toContain("- Writer <b>: https://gh.io/p/x");
  });
});
