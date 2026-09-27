/**
 * Guildhall skill taxonomy: Discipline → Specialisation.
 * Derived from the research in game-ideas-vault/project-01-guildhall/research/game-dev-components.md §6.
 * Skill ids are stable ("art.environment") and stored in the database; never rename an id, only labels.
 */

export type Specialisation = { id: string; label: string };
export type Discipline = { id: string; label: string; specialisations: Specialisation[] };

const d = (id: string, label: string, specs: [string, string][]): Discipline => ({
  id,
  label,
  specialisations: specs.map(([s, l]) => ({ id: `${id}.${s}`, label: l })),
});

export const DISCIPLINES: Discipline[] = [
  d("narrative", "Direction & Narrative", [
    ["creative_direction", "Creative direction"],
    ["narrative_direction", "Narrative direction"],
    ["narrative_design", "Narrative design"],
    ["writing", "Writing"],
    ["worldbuilding", "Lore & worldbuilding"],
    ["vo_direction", "Voice direction"],
  ]),
  d("design", "Design", [
    ["systems", "Systems design"],
    ["level", "Level design"],
    ["combat", "Combat design"],
    ["ux_ui", "UX / UI design"],
    ["economy", "Economy design"],
    ["technical", "Technical design"],
    ["quest", "Quest design"],
  ]),
  d("engineering", "Engineering", [
    ["gameplay", "Gameplay programming"],
    ["engine", "Engine programming"],
    ["rendering", "Rendering / graphics"],
    ["ai", "AI programming"],
    ["networking", "Networking / multiplayer"],
    ["tools", "Tools programming"],
    ["build", "Build / DevOps"],
    ["backend", "Backend / online services"],
    ["audio", "Audio programming"],
    ["porting", "Platform / porting"],
  ]),
  d("art", "Art", [
    ["direction", "Art direction"],
    ["concept", "Concept art"],
    ["environment", "Environment art"],
    ["world", "Environmental / world specialist"],
    ["character", "Character art"],
    ["technical", "Technical art"],
    ["rigging", "Rigging"],
    ["animation", "Animation"],
    ["vfx", "VFX"],
    ["pixel", "2D / pixel art"],
    ["ui", "UI art"],
    ["lighting", "Lighting"],
    ["cinematics", "Cinematics"],
  ]),
  d("audio", "Audio", [
    ["composition", "Composition"],
    ["sound_design", "Sound design"],
    ["implementation", "Audio implementation"],
    ["voice_acting", "Voice acting"],
    ["dialogue_editing", "Dialogue editing"],
  ]),
  d("production", "Production & Quality", [
    ["producer", "Production"],
    ["product", "Product management"],
    ["qa", "QA"],
    ["certification", "Certification"],
    ["localisation", "Localisation"],
    ["accessibility", "Accessibility"],
    ["user_research", "User research"],
    ["data", "Data & analytics"],
  ]),
  d("business", "Business & Community", [
    ["marketing", "Marketing"],
    ["pr", "PR"],
    ["community", "Community management"],
    ["publishing", "Publishing / BD"],
    ["legal", "Legal"],
    ["trailer", "Trailer & capture"],
  ]),
];

const bySkillId = new Map<string, { discipline: Discipline; specialisation: Specialisation }>();
for (const discipline of DISCIPLINES) {
  for (const specialisation of discipline.specialisations) {
    bySkillId.set(specialisation.id, { discipline, specialisation });
  }
}

export const ALL_SKILL_IDS = [...bySkillId.keys()];

export function isSkillId(value: string): boolean {
  return bySkillId.has(value);
}

export function skillLabel(skillId: string): string {
  return bySkillId.get(skillId)?.specialisation.label ?? skillId;
}

export function disciplineOf(skillId: string): Discipline | undefined {
  return bySkillId.get(skillId)?.discipline;
}

export const ENGINES = [
  { id: "unreal", label: "Unreal Engine" },
  { id: "unity", label: "Unity" },
  { id: "godot", label: "Godot" },
  { id: "gamemaker", label: "GameMaker" },
  { id: "custom", label: "Custom engine" },
  { id: "other", label: "Other" },
] as const;

export const PLATFORMS = [
  { id: "pc", label: "PC" },
  { id: "playstation", label: "PlayStation" },
  { id: "xbox", label: "Xbox" },
  { id: "nintendo", label: "Nintendo" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "web", label: "Web" },
  { id: "xr", label: "XR" },
] as const;

export const ENGAGEMENTS = [
  { id: "paid", label: "Paid" },
  { id: "revshare", label: "Rev-share" },
  { id: "jam", label: "Game jam" },
  { id: "hobby", label: "Hobby" },
  { id: "fulltime", label: "Full-time" },
] as const;

export const SENIORITIES = ["student", "junior", "mid", "senior", "lead", "director"] as const;

export const STAGES = [
  { id: "concept", label: "Concept" },
  { id: "preproduction", label: "Pre-production" },
  { id: "prototype", label: "Prototype" },
  { id: "vertical_slice", label: "Vertical slice" },
  { id: "production", label: "Production" },
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
  { id: "launch", label: "Launch" },
  { id: "live", label: "Live ops" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function labelFor(list: readonly { id: string; label: string }[], id: string): string {
  return list.find((x) => x.id === id)?.label ?? id;
}
