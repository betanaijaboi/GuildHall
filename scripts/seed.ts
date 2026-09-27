/**
 * Demo data for local development: people across disciplines, two projects, listings,
 * chat, and replayed GitHub webhooks so the feed, tasks and digest have content.
 * Safe to re-run: it wipes and recreates the demo rows.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { applyWebhook } from "../src/lib/github/apply";
import { createDefaultChannels, channelByName, postMessage } from "../src/lib/messages";
import { milestoneFor } from "../src/lib/milestones";

const url = process.env.DATABASE_URL ?? "postgres://guildhall:guildhall@localhost:5432/guildhall";
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const { users, profileSkills, projects, memberships, roleListings, milestones, posts, githubInstallations, projectRepos, portfolioItems, applications } = schema;

await client`truncate users, projects, github_installations, github_deliveries restart identity cascade`;

type Person = {
  handle: string;
  name: string;
  headline: string;
  skills: string[];
  engines: string[];
  tools: string[];
  availability?: "open" | "limited" | "busy";
  githubLogin?: string;
};

const people: Person[] = [
  { handle: "amara", name: "Amara Okafor", headline: "Narrative director · branching stories", skills: ["narrative.narrative_direction", "narrative.writing", "narrative.creative_direction"], engines: ["godot", "unity"], tools: ["Ink", "Articy:draft"], githubLogin: "amara-okafor" },
  { handle: "lukas", name: "Lukas Brandt", headline: "Environment & world specialist", skills: ["art.environment", "art.world", "art.lighting"], engines: ["unreal", "godot"], tools: ["Houdini", "Gaea", "Substance Designer"] },
  { handle: "mei", name: "Mei Tanaka", headline: "Godot gameplay + networking", skills: ["engineering.gameplay", "engineering.networking"], engines: ["godot"], tools: ["GDScript", "C#"], githubLogin: "mei-tanaka" },
  { handle: "rafael", name: "Rafael Costa", headline: "Composer & sound designer", skills: ["audio.composition", "audio.sound_design", "audio.implementation"], engines: ["unity", "godot"], tools: ["Reaper", "FMOD"] },
  { handle: "priya", name: "Priya Nair", headline: "Level designer, ex-AAA", skills: ["design.level", "design.combat"], engines: ["unreal"], tools: ["Blueprints", "TrenchBroom"], availability: "limited" },
  { handle: "jonas", name: "Jonas Lindqvist", headline: "Rendering / engine programmer", skills: ["engineering.rendering", "engineering.engine"], engines: ["unreal", "custom"], tools: ["C++", "HLSL", "RenderDoc"], githubLogin: "jlindqvist" },
  { handle: "sofia", name: "Sofia Marín", headline: "Character animator", skills: ["art.animation", "art.rigging"], engines: ["unity", "godot"], tools: ["Maya", "Blender", "Cascadeur"] },
  { handle: "kwame", name: "Kwame Mensah", headline: "Indie producer", skills: ["production.producer", "business.marketing"], engines: ["godot"], tools: ["Codecks", "Notion"] },
  { handle: "elena", name: "Elena Petrova", headline: "UX/UI designer for games", skills: ["design.ux_ui", "art.ui"], engines: ["unity", "godot"], tools: ["Figma"] },
  { handle: "tomas", name: "Tomás Rivera", headline: "QA & accessibility", skills: ["production.qa", "production.accessibility"], engines: ["unity", "unreal", "godot"], tools: ["TestRail"], availability: "busy" },
];

const ids: Record<string, string> = {};
for (const p of people) {
  const [u] = await db
    .insert(users)
    .values({
      handle: p.handle,
      name: p.name,
      headline: p.headline,
      bio: `${p.headline}. Looking for projects with a clear vision and a finished-is-better-than-perfect attitude.`,
      engines: p.engines,
      tools: p.tools,
      platforms: ["pc"],
      engagements: ["revshare", "paid", "jam"],
      availability: p.availability ?? "open",
      seniority: "senior",
      timezone: "Europe/London",
      githubLogin: p.githubLogin,
    })
    .returning();
  ids[p.handle] = u.id;
  await db.insert(profileSkills).values(p.skills.map((skillId) => ({ userId: u.id, skillId })));
}
await db.insert(portfolioItems).values([
  { userId: ids.lukas, title: "Harbour district — UE5 environment", url: "https://www.artstation.com/", description: "Modular kit + Houdini-scattered debris" },
  { userId: ids.rafael, title: "Adaptive combat score (FMOD)", url: "https://soundcloud.com/", description: "Three-layer vertical remix" },
]);

// Project 1: Godot, vertical slice, linked to a (fake) GitHub repo.
const [tide] = await db
  .insert(projects)
  .values({
    slug: "tidebound",
    name: "Tidebound",
    pitch: "A narrative sailing roguelite: every voyage rewrites the island chain, and the crew remembers what you did last run.",
    engine: "godot",
    stage: "vertical_slice",
    platforms: ["pc", "nintendo"],
    genres: ["Roguelite", "Narrative"],
    engagement: "revshare",
    ownerId: ids.amara,
  })
  .returning();
await db.insert(memberships).values([
  { projectId: tide.id, userId: ids.amara, role: "owner", skillId: "narrative.narrative_direction" },
  { projectId: tide.id, userId: ids.mei, role: "lead", skillId: "engineering.gameplay" },
  { projectId: tide.id, userId: ids.kwame, role: "member", skillId: "production.producer" },
]);
await createDefaultChannels(db, tide.id);
const slice = milestoneFor("vertical_slice");
slice.checklist[0].done = true;
await db.insert(milestones).values([
  { projectId: tide.id, ...milestoneFor("prototype"), checklist: milestoneFor("prototype").checklist.map((c) => ({ ...c, done: true })), completedAt: new Date(Date.now() - 20 * 86_400_000) },
  { projectId: tide.id, ...slice },
]);
const [envListing] = await db
  .insert(roleListings)
  .values([
    { projectId: tide.id, skillId: "art.environment", title: "Environment artist (islands & harbours)", engagement: "revshare", hoursPerWeek: 10, compensation: "Rev-share, credited", description: "Stylised islands, modular docks. Godot 4, Blender." },
    { projectId: tide.id, skillId: "audio.composition", title: "Composer for an adaptive sea shanty score", engagement: "paid", hoursPerWeek: 5, compensation: "$1,500 for the slice" },
  ])
  .returning();
await db.insert(applications).values({ listingId: envListing.id, userId: ids.lukas, message: "Harbours are my favourite thing to build — see the UE5 harbour in my portfolio." });

const general = (await channelByName(db, tide.id, "general"))!;
const art = (await channelByName(db, tide.id, "art"))!;
await postMessage(db, { channelId: general.id, authorId: ids.amara, body: "Welcome aboard! Vertical slice target: one island, one full voyage, final-quality art in the harbour." });
await postMessage(db, { channelId: general.id, authorId: ids.mei, body: "Boat controller is in. Wind now affects turn radius — PR coming tonight." });
await postMessage(db, { channelId: art.id, authorId: ids.amara, body: "Moodboard for the harbour is pinned in the GDD. Still recruiting an environment artist." });
await db.insert(posts).values({ projectId: tide.id, authorId: ids.amara, title: "Devlog #1 — the crew remembers", body: "We've got the core loop running: set sail, weather a storm, dock, and the crew's memory updates.\n\nNext up is the vertical slice harbour.", visibility: "public" });

await db.insert(githubInstallations).values({ id: 1001, accountLogin: "tidebound-studio", accountType: "Organization", installedByUserId: ids.amara });
await db.insert(projectRepos).values({ projectId: tide.id, installationId: 1001, repoId: 5001, fullName: "tidebound-studio/tidebound", defaultBranch: "main" });

// Replay a few webhooks through the real pipeline.
const repo = { id: 5001, full_name: "tidebound-studio/tidebound" };
const hooks: [string, Record<string, unknown>][] = [
  ["push", { ref: "refs/heads/main", repository: repo, sender: { login: "mei-tanaka" }, pusher: { name: "mei-tanaka" }, compare: "https://github.com/tidebound-studio/tidebound/compare/a...b", commits: [{ message: "Wind affects turn radius" }, { message: "Tune boat drag" }] }],
  ["push", { ref: "refs/heads/harbour-art", repository: repo, sender: { login: "amara-okafor" }, pusher: { name: "amara-okafor" }, compare: "https://github.com/tidebound-studio/tidebound/compare/c...d", commits: [{ message: "Dress the harbour", modified: ["Scenes/Harbour.tscn", "Art/Harbour/dock_kit.blend", "Art/Harbour/harbour_key.psd"] }] }],
  ["push", { ref: "refs/heads/main", repository: repo, sender: { login: "mei-tanaka" }, pusher: { name: "mei-tanaka" }, compare: "https://github.com/tidebound-studio/tidebound/compare/d...e", commits: [{ message: "Fix dock collision", modified: ["Art/Harbour/dock_kit.blend"] }] }],
  ["pull_request", { action: "opened", repository: repo, sender: { login: "mei-tanaka" }, pull_request: { number: 12, title: "Storm event system", html_url: "https://github.com/tidebound-studio/tidebound/pull/12", state: "open", draft: false, merged: false } }],
  ["pull_request_review", { action: "submitted", repository: repo, sender: { login: "jlindqvist" }, review: { state: "approved", body: "Nice, the wave sampling is clean.", html_url: "https://github.com/tidebound-studio/tidebound/pull/12#review" }, pull_request: { number: 12, title: "Storm event system" } }],
  ["pull_request", { action: "closed", repository: repo, sender: { login: "mei-tanaka" }, pull_request: { number: 12, title: "Storm event system", html_url: "https://github.com/tidebound-studio/tidebound/pull/12", state: "closed", merged: true } }],
  ["issues", { action: "opened", repository: repo, sender: { login: "amara-okafor" }, issue: { number: 13, title: "Crew memory: first-mate reacts to abandoned cargo", body: "", html_url: "https://github.com/tidebound-studio/tidebound/issues/13", state: "open", assignee: { login: "mei-tanaka" } } }],
  ["issues", { action: "opened", repository: repo, sender: { login: "amara-okafor" }, issue: { number: 14, title: "Harbour blockout pass", body: "", html_url: "https://github.com/tidebound-studio/tidebound/issues/14", state: "open", assignee: null } }],
  ["workflow_run", { action: "completed", repository: repo, sender: { login: "mei-tanaka" }, workflow_run: { name: "Godot CI", conclusion: "failure", head_branch: "storm-events", html_url: "https://github.com/tidebound-studio/tidebound/actions/runs/1", head_commit: { message: "WIP storm audio" }, actor: { login: "mei-tanaka" } } }],
  ["release", { action: "published", repository: repo, sender: { login: "mei-tanaka" }, release: { name: "v0.3 — first voyage", tag_name: "v0.3", html_url: "https://github.com/tidebound-studio/tidebound/releases/tag/v0.3", assets: [{ name: "tidebound-web.zip" }, { name: "tidebound-win.zip" }] } }],
];
let n = 0;
for (const [event, payload] of hooks) await applyWebhook(db, `seed-${++n}`, event, payload);

// Project 2: Unreal, concept stage, recruiting.
const [ash] = await db
  .insert(projects)
  .values({
    slug: "ashen-crown",
    name: "Ashen Crown",
    pitch: "A dark-fantasy action RPG about an heir reclaiming a throne from a usurper who remembers every duel.",
    engine: "unreal",
    stage: "concept",
    platforms: ["pc", "playstation", "xbox"],
    genres: ["Action RPG", "Dark fantasy"],
    engagement: "revshare",
    ownerId: ids.priya,
  })
  .returning();
await db.insert(memberships).values({ projectId: ash.id, userId: ids.priya, role: "owner", skillId: "design.level" });
await createDefaultChannels(db, ash.id);
await db.insert(milestones).values({ projectId: ash.id, ...milestoneFor("concept") });
await db.insert(roleListings).values([
  { projectId: ash.id, skillId: "narrative.narrative_direction", title: "Narrative director", engagement: "revshare", hoursPerWeek: 8, compensation: "Rev-share" },
  { projectId: ash.id, skillId: "art.concept", title: "Concept artist — characters & castles", engagement: "paid", compensation: "Per piece" },
]);

await client.end();
console.log(`seeded ${people.length} people, 2 projects, ${hooks.length} webhook deliveries`);
