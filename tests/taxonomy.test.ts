import { describe, expect, it } from "vitest";
import { STAGE_CHECKLISTS, STAGE_CORE_SKILLS } from "@/lib/stages";
import { ALL_SKILL_IDS, disciplineOf, isSkillId, skillLabel, STAGES } from "@/lib/taxonomy";
import { milestoneFor, nextStage } from "@/lib/milestones";

describe("taxonomy", () => {
  it("has unique, namespaced skill ids", () => {
    expect(new Set(ALL_SKILL_IDS).size).toBe(ALL_SKILL_IDS.length);
    for (const id of ALL_SKILL_IDS) expect(id).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("covers the disciplines the research calls out", () => {
    for (const id of ["narrative.narrative_direction", "art.world", "art.environment", "engineering.gameplay", "audio.composition", "production.qa"]) {
      expect(isSkillId(id)).toBe(true);
    }
    expect(skillLabel("art.world")).toBe("Environmental / world specialist");
    expect(disciplineOf("art.world")?.id).toBe("art");
    expect(isSkillId("art.nonsense")).toBe(false);
  });

  it("references only real skills and defines every stage", () => {
    for (const stage of STAGES) {
      expect(STAGE_CHECKLISTS[stage.id].length).toBeGreaterThan(0);
      for (const skill of STAGE_CORE_SKILLS[stage.id]) expect(isSkillId(skill), skill).toBe(true);
    }
  });

  it("builds milestones and walks the pipeline", () => {
    const m = milestoneFor("prototype");
    expect(m.title).toBe("Prototype");
    expect(m.checklist.every((c) => !c.done)).toBe(true);
    expect(nextStage("prototype")).toBe("vertical_slice");
    expect(nextStage("live")).toBeNull();
  });
});
