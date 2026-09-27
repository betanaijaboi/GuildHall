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
import { templateById } from "../src/lib/pipelines";
import { ensureGdd } from "../src/lib/gdd-db";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL ?? "postgres://guildhall:guildhall@localhost:5432/guildhall";
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const { users, profileSkills, projects, memberships, roleListings, milestones, posts, githubInstallations, projectRepos, portfolioItems, applications, pipelineItems, tasks, gigs, gigTiers, gigAddons, credits, messages, messageVotes, gddPages, gddLinks, channels, channelAccess, channelLinks, jams, jamSeekers } = schema;

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

// Forum proposals on Tidebound.
const proposals = (await channelByName(db, tide.id, "proposals"))!;
const [p1, p2] = await db.insert(messages).values([
  { channelId: proposals.id, authorId: ids.mei, title: "Tides that flood the low districts at night", body: "Night voyages raise the tide: low harbour streets flood, opening boat-only shortcuts and closing some shops.", tags: ["mechanic", "level"], topicStatus: "open" },
  { channelId: proposals.id, authorId: ids.kwame, title: "Crew morale shown as a sea shanty that changes key", body: "Instead of a meter, the ambient shanty shifts from major to minor as morale drops. Needs audio!", tags: ["audio", "ui", "needs-art"], topicStatus: "accepted" },
  { channelId: proposals.id, authorId: ids.amara, title: "Cut the fishing minigame from the slice", body: "It's fun but not core. Park it for after the vertical slice.", tags: ["scope"], topicStatus: "parked" },
]).returning();
await db.insert(messageVotes).values([{ messageId: p1.id, userId: ids.amara }, { messageId: p1.id, userId: ids.kwame }, { messageId: p2.id, userId: ids.mei }]);

// Asset pipelines on Tidebound.
for (const [name, templateId, done, owners] of [
  ["Captain Mara", "character", 2, [ids.amara, ids.mei]],
  ["Harbour district", "environment", 1, [ids.amara]],
  ["Storm theme", "music", 0, []],
] as const) {
  const template = templateById(templateId)!;
  const [item] = await db.insert(pipelineItems).values({ projectId: tide.id, name, template: template.id, stages: template.stages, createdBy: ids.amara }).returning();
  await db.insert(tasks).values(
    template.stages.map((stage, i) => ({
      projectId: tide.id, title: `${name}: ${stage}`, pipelineItemId: item.id, stageIndex: i,
      status: i < done ? ("done" as const) : i === done ? ("doing" as const) : ("todo" as const),
      completedAt: i < done ? new Date() : null, assigneeId: owners[i] ?? null,
    })),
  );
}

// Living GDD for Tidebound: default tree with a real overview, characters linked to the pipeline.
await ensureGdd(db, tide.id, ids.amara);
const pages = await db.select().from(gddPages).where(eq(gddPages.projectId, tide.id));
const page = (t: string) => pages.find((p) => p.title === t)!;
await db.update(gddPages).set({ body: `## Elevator pitch
A narrative sailing roguelite: every voyage rewrites the island chain, and **the crew remembers** what you did last run.

## Design pillars
- **The sea is the level**: weather and tides reshape routes every run
- **Crew memory over stats**: relationships, not numbers, carry between runs
- **Finish the voyage**: runs last 25–40 minutes

## Core loop
1. Choose a heading and a crew
2. Weather a storm event
3. Dock, trade, and resolve a crew moment
4. The crew's memory updates, and the islands shift

| Platform | Target |
|---|---|
| PC (Steam) | 60 fps on Steam Deck |
| Nintendo | Stretch goal |
` }).where(eq(gddPages.id, page("Overview").id));
const mara = (await db.select().from(pipelineItems).where(eq(pipelineItems.name, "Captain Mara")))[0];
await db.insert(gddLinks).values({ pageId: page("Characters").id, targetType: "pipeline", targetId: mara.id });
await db.update(channels).set({ pinnedPageId: page("Art direction").id }).where(eq(channels.id, art.id));

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

// Shipped credits from before Guildhall (self-reported, confirmable by teammates on the same title).
await db.insert(credits).values([
  { userId: ids.jonas, title: "Ashfall Frontier", titleKey: "ashfall frontier", role: "Rendering Programmer", year: 2023, externalUrl: "https://www.mobygames.com/game/ashfall-frontier", source: "self" },
  { userId: ids.priya, title: "Ashfall Frontier", titleKey: "ashfall frontier", role: "Level Designer", year: 2023, source: "self" },
]);

// Service gigs.
for (const g of [
  { seller: "rafael", title: "Adaptive combat music for your game", skillId: "audio.composition", engines: ["unity", "godot"], formats: "WAV 48kHz stems + FMOD bank",
    tiers: [["basic", "1 loopable track", 15000, 5, 1], ["standard", "3 adaptive intensity layers", 40000, 10, 2], ["premium", "Full FMOD implementation", 75000, 14, 3]],
    addons: [["Stems for each layer", 6000], ["Trailer licence", 10000]] },
  { seller: "sofia", title: "Game-ready character rig with facial controls", skillId: "art.rigging", engines: ["unity", "unreal"], formats: "FBX + Maya/Blender source",
    tiers: [["basic", "Body rig", 20000, 4, 1], ["standard", "Body + facial rig", 45000, 8, 2]], addons: [] },
  { seller: "lukas", title: "Stylised environment props (Blender to engine)", skillId: "art.environment", engines: ["godot", "unreal"], formats: "GLB/FBX + PBR textures 2K",
    tiers: [["basic", "3 props", 12000, 5, 1], ["standard", "8 props", 28000, 9, 2], ["premium", "15 props + modular kit", 50000, 14, 2]], addons: [["4K textures", 5000]] },
] as const) {
  const [gig] = await db.insert(gigs).values({ sellerId: ids[g.seller], title: g.title, skillId: g.skillId, engines: [...g.engines], formats: g.formats, description: `${g.title}. Tell me about your game and I'll match its style.` }).returning();
  await db.insert(gigTiers).values(g.tiers.map(([tier, name, priceCents, deliveryDays, revisions]) => ({ gigId: gig.id, tier, name, priceCents, deliveryDays, revisions })));
  if (g.addons.length) await db.insert(gigAddons).values(g.addons.map(([name, priceCents]) => ({ gigId: gig.id, name, priceCents })));
}

// C22: a task the lead handed to the AI coding agent, whose PR is open for review.
await db.insert(tasks).values([
  { projectId: tide.id, title: "Fix web export: storm shader fails to compile", status: "doing", agentStatus: "pr_open", agentPrUrl: "https://github.com/tidebound-studio/tidebound/pull/31", agentRequestedBy: ids.amara, ghRepoId: 5001, ghIssueNumber: 30, ghUrl: "https://github.com/tidebound-studio/tidebound/issues/30" },
  { projectId: tide.id, title: "Add controller rebinding to the options menu", status: "todo", agentStatus: "requested", agentRequestedBy: ids.amara, ghRepoId: 5001, ghIssueNumber: 32, ghUrl: "https://github.com/tidebound-studio/tidebound/issues/32" },
]);

// C15: a publisher guest on Tidebound who only sees #art, and #builds shared with Ashen Crown.
const [hana] = await db.insert(users).values({ handle: "hana", name: "Hana Kim", headline: "Publishing producer at Lantern Games", bio: "Publisher-side producer.", platforms: ["pc"] }).returning();
await db.insert(memberships).values({ projectId: tide.id, userId: hana.id, role: "guest" });
const tideArt = (await channelByName(db, tide.id, "art"))!;
await db.insert(channelAccess).values({ channelId: tideArt.id, userId: hana.id });
await postMessage(db, { channelId: tideArt.id, authorId: null, body: "👋 Hana Kim joined as a guest (Publisher: Lantern Games). They can see #art." });
await postMessage(db, { channelId: tideArt.id, authorId: hana.id, body: "Loving the harbour mood. Could we get a key-art pass for the Steam capsule by the end of the month?" });
const tideBuilds = (await channelByName(db, tide.id, "builds"))!;
await db.insert(channelLinks).values({ channelId: tideBuilds.id, projectId: ash.id });
await postMessage(db, { channelId: tideBuilds.id, authorId: null, body: "🔗 #builds is now shared with Ashen Crown (linked by Priya Nair). Both teams can read and post here." });

// C4: a live jam with one team and two solo jammers, plus an upcoming jam with a secret theme.
const [tinyJam] = await db.insert(jams).values({
  slug: "tiny-tides-jam", name: "Tiny Tides Jam", hostId: ids.kwame, theme: "Everything is borrowed",
  description: "48 hours, any engine, teams of up to 4. Make something small and finished.",
  startsAt: new Date(Date.now() - 20 * 3_600_000), endsAt: new Date(Date.now() + 28 * 3_600_000), maxTeamSize: 4,
}).returning();
await db.insert(jams).values({
  slug: "pixel-harvest-jam", name: "Pixel Harvest Jam", hostId: ids.elena, theme: "Roots", itchUrl: "https://itch.io/jam/pixel-harvest",
  description: "A cozy pixel-art jam. Entries go on itch.io; form your team here.",
  startsAt: new Date(Date.now() + 3 * 86_400_000), endsAt: new Date(Date.now() + 5 * 86_400_000), maxTeamSize: 3,
});
const { formTeam } = await import("../src/lib/jams-db");
const { team: jamTeam } = await formTeam(db as never, tinyJam, ids.sofia, { name: "Borrowed Light", engine: "godot", lookingFor: ["engineering.gameplay", "audio.composition"] });
await db.insert(jamSeekers).values([
  { jamId: tinyJam.id, userId: ids.tomas, note: "QA + level scripting, 5h/day, happy to playtest everyone's builds.", skills: ["production.qa", "design.level"] },
  { jamId: tinyJam.id, userId: ids.rafael, note: "Composer looking for a moody little game to score.", skills: ["audio.composition", "audio.sound_design"] },
]);
void jamTeam;

await client.end();
console.log(`seeded ${people.length} people, 2 projects, ${hooks.length} webhook deliveries`);
