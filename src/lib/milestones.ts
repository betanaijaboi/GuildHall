import { STAGE_CHECKLISTS } from "./stages";
import { STAGES, type StageId } from "./taxonomy";

export function milestoneFor(stage: StageId) {
  return {
    stage,
    title: STAGES.find((s) => s.id === stage)!.label,
    checklist: STAGE_CHECKLISTS[stage].map((text) => ({ text, done: false })),
  };
}

/** The stage after `stage`, or null at the end of the pipeline. */
export function nextStage(stage: StageId): StageId | null {
  const i = STAGES.findIndex((s) => s.id === stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].id : null;
}
