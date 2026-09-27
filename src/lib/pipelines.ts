/**
 * Asset pipelines (Codecks-style "journeys"): an asset type's stages, defined once, applied to
 * every asset of that type. Stages run in order; a stage is locked until the previous is done.
 */

export type PipelineTemplate = { id: string; label: string; emoji: string; stages: string[]; discipline: string };

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  { id: "character", label: "Character", emoji: "🧙", discipline: "art", stages: ["Concept", "Sculpt", "Retopo", "UV & texture", "Rig", "Animate", "In-engine"] },
  { id: "environment", label: "Environment kit", emoji: "🏝️", discipline: "art", stages: ["Blockout", "Concept paintover", "Modular modelling", "Texturing", "Set dressing", "Lighting", "Optimisation"] },
  { id: "prop", label: "Prop", emoji: "📦", discipline: "art", stages: ["Concept", "Model", "Texture", "In-engine"] },
  { id: "animation", label: "Animation set", emoji: "🏃", discipline: "art", stages: ["Reference", "Blocking", "Splining", "Polish", "In-engine & events"] },
  { id: "vfx", label: "VFX", emoji: "✨", discipline: "art", stages: ["Concept", "Prototype", "Final effect", "Optimisation"] },
  { id: "music", label: "Music track", emoji: "🎼", discipline: "audio", stages: ["Sketch", "Composition", "Mix & master", "Middleware implementation"] },
  { id: "sfx", label: "Sound effect set", emoji: "🔊", discipline: "audio", stages: ["Spotting list", "Design", "Mix", "Implementation"] },
  { id: "level", label: "Level", emoji: "🗺️", discipline: "design", stages: ["Paper design", "Greybox", "Playtest", "Art pass", "Polish & bugfix"] },
  { id: "dialogue", label: "Dialogue scene", emoji: "💬", discipline: "narrative", stages: ["Outline", "Draft", "Review", "VO recording", "Implementation"] },
  { id: "ui", label: "UI screen", emoji: "🖥️", discipline: "design", stages: ["Wireframe", "Mockup", "Implementation", "Usability test"] },
];

export function templateById(id: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.find((t) => t.id === id);
}

export type StageTaskStatus = "todo" | "doing" | "done";
export type StageState = "done" | "doing" | "ready" | "locked";

/** Display state of each stage given its task status, in order. */
export function stageStates(statuses: StageTaskStatus[]): StageState[] {
  return statuses.map((s, i) => {
    if (s === "done") return "done";
    const unlocked = i === 0 || statuses[i - 1] === "done";
    if (!unlocked) return "locked";
    return s === "doing" ? "doing" : "ready";
  });
}

/** Index of the stage currently in play (first not done), or -1 when the pipeline is complete. */
export function currentStage(statuses: StageTaskStatus[]): number {
  return statuses.findIndex((s) => s !== "done");
}

export function isStageLocked(statuses: StageTaskStatus[], index: number): boolean {
  return index > 0 && statuses.slice(0, index).some((s) => s !== "done");
}

export function progress(statuses: StageTaskStatus[]): number {
  return statuses.length ? Math.round((statuses.filter((s) => s === "done").length / statuses.length) * 100) : 0;
}
