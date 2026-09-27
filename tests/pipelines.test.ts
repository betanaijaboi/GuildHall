import { describe, expect, it } from "vitest";
import { currentStage, isStageLocked, PIPELINE_TEMPLATES, progress, stageStates } from "@/lib/pipelines";
import { isSkillId } from "@/lib/taxonomy";

describe("pipelines", () => {
  it("templates have unique ids and ordered stages", () => {
    expect(new Set(PIPELINE_TEMPLATES.map((t) => t.id)).size).toBe(PIPELINE_TEMPLATES.length);
    for (const t of PIPELINE_TEMPLATES) expect(t.stages.length).toBeGreaterThan(2);
    expect(isSkillId(`${PIPELINE_TEMPLATES[0].discipline}.concept`)).toBe(true);
  });

  it("locks stages until the previous one is done", () => {
    expect(stageStates(["done", "doing", "todo", "todo"])).toEqual(["done", "doing", "locked", "locked"]);
    expect(stageStates(["done", "todo", "todo"])).toEqual(["done", "ready", "locked"]);
    expect(isStageLocked(["done", "todo", "todo"], 2)).toBe(true);
    expect(isStageLocked(["done", "done", "todo"], 2)).toBe(false);
  });

  it("tracks the current stage and progress", () => {
    expect(currentStage(["done", "doing", "todo"])).toBe(1);
    expect(currentStage(["done", "done"])).toBe(-1);
    expect(progress(["done", "done", "todo", "todo"])).toBe(50);
  });
});
