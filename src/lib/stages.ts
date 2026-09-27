import type { StageId } from "./taxonomy";

/**
 * Specialisations a team typically needs active at each stage, from the pipeline research
 * (game-dev-components.md §2). Used by team-gap analysis. Deliberately short: these are the
 * roles whose absence usually blocks the stage, not every role that could help.
 */
export const STAGE_CORE_SKILLS: Record<StageId, string[]> = {
  concept: ["narrative.creative_direction", "design.systems", "art.concept"],
  preproduction: ["narrative.creative_direction", "design.systems", "engineering.gameplay", "art.concept", "production.producer"],
  prototype: ["design.systems", "engineering.gameplay"],
  vertical_slice: [
    "design.systems",
    "design.level",
    "engineering.gameplay",
    "art.environment",
    "art.animation",
    "audio.sound_design",
    "design.ux_ui",
  ],
  production: [
    "narrative.narrative_design",
    "design.level",
    "engineering.gameplay",
    "art.environment",
    "art.character",
    "art.animation",
    "art.vfx",
    "audio.composition",
    "audio.sound_design",
    "production.producer",
  ],
  alpha: ["engineering.gameplay", "engineering.build", "production.qa", "production.producer"],
  beta: ["production.qa", "production.localisation", "production.accessibility", "engineering.gameplay"],
  launch: ["business.marketing", "business.community", "engineering.build", "production.certification"],
  live: ["business.community", "production.data", "engineering.backend"],
};

/** Default checklist for a milestone at each stage — what "done" means before moving on. */
export const STAGE_CHECKLISTS: Record<StageId, string[]> = {
  concept: ["One-sheet written (pitch, pillars, core loop)", "Target platform(s) and engine chosen", "Reference moodboard collected"],
  preproduction: ["GDD first draft", "Art direction / style targets agreed", "Repo created with engine template", "Scope A defined"],
  prototype: ["Core loop playable", "Playtested with at least 3 people", "Decision recorded: is it fun?"],
  vertical_slice: ["One level at final quality", "Final-quality art, audio and UI in the slice", "Performance target met on target hardware", "Build shared with testers"],
  production: ["Content plan per milestone", "All systems implemented", "Weekly builds from CI"],
  alpha: ["Feature complete", "Playable start to finish", "Bug tracker triaged"],
  beta: ["Content complete", "Localisation pass", "Accessibility options reviewed", "Age rating questionnaire (IARC) submitted"],
  launch: ["Store page and assets ready", "Platform certification passed", "Launch-day patch plan"],
  live: ["Update cadence planned", "Telemetry dashboard live", "Community feedback loop in place"],
};
