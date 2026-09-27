# Guildhall

*Working title.* A meeting place and marketplace for game makers: narrative
directors, environment specialists, engine enthusiasts, composers, producers,
every discipline. People list their skills, form teams, work in a
Teams-style project workspace and post progress, with GitHub deeply in the
loop.

The product spec, research and roadmap live in the private design vault
(`game-ideas-vault/project-01-guildhall`). This repo is the **MVP (Scope A)**.

## What's in the MVP

| Pillar | Built |
|---|---|
| **Find** | Profiles on a 7-discipline / ~50-specialisation game-dev taxonomy, plus engines, platforms, tools, availability and portfolio. People search with facets. Project browse with a "recruiting for" filter. Role listings, applications, accept/decline |
| **Build** | Per-project channels (`#general #design #art #code #audio #builds #github`), threads, and live updates (SSE). A task board with GitHub issues synced in. Roles: owner, lead, member, contractor, guest |
| **Show** | Milestones per pipeline stage with default checklists; completing one advances the stage. Team or public devlog posts. A public project page. A weekly digest built from real activity, which can be posted to `#general` |
| **GitHub** | GitHub App sign-in. Verified installation ownership. Repo linking. HMAC-verified, idempotent webhooks: push, PR, review, issue, comment, CI failure and release go to chat cards, with threading and live PR state. Issues become tasks (assign, close, reopen). Accepted members get invited as collaborators, and removed members lose access. An engine setup PR (Unity, Unreal, Godot) with LFS `lockable` rules, CI and issue templates. "Merged PRs" evidence on profiles |
| **Asset review** | Upload PNG, JPEG, WebP, GIF, MP4, WebM or GLB (checked by content sniffing; SVG and HTML are rejected). Pin comments on images, frame-accurate pins on video with a timeline, and surface hotspots on 3D models via `<model-viewer>`. Versions, approve or request changes (you can't approve your own upload), threaded activity in `#art`. Files are served only to members, with Range support |
| **Conflict radar** | Push webhooks record who touched unmergeable files (.umap, .uasset, .unity, .psd, .blend, …). A file edited by 2+ people in a week triggers one `#art` warning per file per week, cross-branch aware. The radar page shows hotspots, recent touches and live Git LFS locks, with ask-to-release and lead-only force unlock |
| **Asset pipelines** | Ten templates (character, environment, prop, animation, VFX, music, SFX, level, dialogue, UI). Every stage is a task that unlocks in order (enforced on the board). Approving a linked asset review, or closing the stage's GitHub issue, completes the stage and pings whoever is next. Mirrored to GitHub as a parent issue plus sub-issues with blocked-by links. Producer grid per asset type |
| **Contracts & payments** | Contract templates (work-for-hire or rev-share) with IP assignment, credits, portfolio and confidentiality terms. Text is frozen and SHA-256 hashed on send; typed-name e-signatures by both parties; paid contractors get repo access only once signed. Milestones are funded via Stripe Checkout (Connect, separate charges and transfers) and released on approval or automatically when a linked asset is approved. Fees: 6%, or a client-paid $29 flat fee so the maker keeps 100%. Disputes, reviews, payout onboarding. See [docs/payments.md](docs/payments.md); simulated locally |
| **Service gigs** | Productised services with Basic/Standard/Premium tiers (validated to rise in price), delivery days, revisions, formats and add-ons. Filter by discipline and engine. Ordering opens a private workspace (buyer owner, seller contractor) with the contract pre-filled from the tier and brief and sent for signature, so escrow, asset review and release reuse the normal flow. 3 active gig slots by default |
| **Guild Rank** | Apprentice → Journeyman → Artisan → Master → Grandmaster, from verified evidence only: merged PRs, approved assets, paid milestones delivered, pipeline stages completed, teammate skill endorsements (you must share a project) and reviews. Each input is capped and itemised on the profile. Ranks unlock gig slots (3 → 20) and give avatars a rank-coloured frame |
| **Shipped credits** | Profiles list shipped titles with role and year, linked to Steam, IGDB, MobyGames, itch.io or a store (https allow-list). Self-reported credits become "confirmed" when a teammate credited on the same title vouches. Reaching Launch (or a lead's button) generates verified credits for the whole roster and opens a CREDITS.md PR. Verified and confirmed credits count toward Guild Rank |
| **Rate transparency** | Opt-in anonymous hourly rate reports per skill, seniority and region (region inferred from timezone). Quartiles are published only with 10+ reports. Median gig prices per skill. A live rate hint appears when posting a paid role or pricing a gig |
| **Forum channels** | A `#proposals` forum (added to existing projects on first visit). Topics show title, tags and a status (open, accepted, parked, done), with upvotes. Sort by top, active or new, and filter by status or tag. Leads set status and tags. Members turn a topic into a task, and leads can open a GitHub issue, each linked back to the discussion |
| **Living GDD** | Default page tree (Overview, Mechanics, Characters, World, Levels, Art/Audio direction, Tech), one level of nesting, a safe markdown renderer (no raw HTML, https-only links, Figma/Miro-only embeds). Version-checked saves so concurrent edits never overwrite each other. Link tasks, pipelines and assets for live % complete. Pin a page to a channel header, and promote forum topics into pages |
| **Your hand** | One cross-project queue of everything waiting on you: contracts to sign, milestones to release or fund, assets to review (not your own uploads), assigned tasks and pipeline stages (locked ones last), and @mentions from the last 14 days. Blocking work comes first, shown as a fanned card hand plus a drag-to-reorder list that persists |
| **Automations** | When → then rules. Triggers: CI failure (branch filter), release published, task or pipeline stage done, asset submitted or approved, member joined, weekly schedule. Actions: post or ping in a channel with `{title}/{url}/{actor}/{branch}` templates, draft a devlog, post the digest. Five one-click templates, a step-by-step builder, and plain-English drafting (Claude via structured outputs when `ANTHROPIC_API_KEY` is set, otherwise a deterministic phrase parser), always confirmed by a lead. Weekly rules run from a secret-protected hourly cron. Rules can't trigger each other |
| **Guests & shared channels** | Invite links for publishers, outsourcers, porting partners and localisers that grant only chosen channels and assets (single or multi-use, expiring, stored hashed, claimed atomically). Guests see just Chat and Assets, can pin notes on shared assets, and never get repo access; existing members are never downgraded. Two projects can share one channel via a one-time `GH-XXXX-XXXX` code (48h); either side can stop sharing. Sign-in returns you to the invite |
| **Huddles + recaps** | One-click voice/video calls in any chat channel (up to 8 people, peer-to-peer WebRTC with server-relayed signalling). Camera, screen share with live draw-over that fades, speaking indicators, shared notes, and opt-in captions transcribed in each speaker's browser (nothing is recorded). Ending the call (or everyone leaving) posts a recap: a summary, decisions and follow-ups with owners, from Claude when configured or rules otherwise. Members turn follow-ups into assigned tasks in one click. Works for guests and shared channels too |
| **AI coding agent** | Leads hand an open task to an AI coding agent. Guildhall files (or reuses) the GitHub issue with a brief: context, linked GDD pages, "done when" criteria and guardrails. It then applies the `guildhall-agent` label, which a repo workflow (added by a one-click setup PR) uses to run Claude Code via `anthropics/claude-code-action`. Branches like `claude/issue-N` and PRs saying `Fixes #N` flow back to the task card (working, PR open, merged) and into #code. The agent can't merge; a teammate reviews |
| **Jam mode** | Host a jam, or mirror one running on itch.io. The theme stays secret until the start (the host can see it), with a live ticking countdown. A team-formation board has solo "looking for a team" posts and teams listing the roles they need. Ask to join; the founder accepts within the size limit (race-safe), and a person can only be on one team per jam. Each team gets an auto-created jam workspace with a deadline banner and 24h, 1h and end reminders from the hourly cron. Teams submit entries (itch.io pages for itch jams), shown in an entries gallery |
| **Playtests + player feedback** | Run a playtest with a build link (or the latest GitHub release automatically), a tester cap and structured questions (ratings, choices, free text). Players join from the public project page and send feedback; results show rating averages, choice bars and recent answers. An in-game reporter endpoint (`POST /api/feedback`, per-build keys stored hashed, rate-limited, CORS for web builds) accepts bug reports with screenshots, with curl, Godot and Unity snippets. Everything lands in one inbox, threaded into #general, and the team triages each report into a GitHub issue (player text quoted, @mentions neutralised) or a task, or dismisses it |
| **Team gaps** | Compares the roster with the roles the current stage needs, and suggests people ranked by skill, engine and availability |

**Not in the MVP yet** (see the build order in the vault's competitor-components.md): voice/video, two-way issue sync, Discord bridge, desktop and
mobile apps, verified skill badges beyond the merged-PR count, and direct
invites.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · PostgreSQL + Drizzle ORM · Claude API (optional, `claude-opus-5`, structured outputs + server-side refusal fallbacks) ·
Tailwind CSS 4 · Octokit (GitHub App) · Vitest.

Live chat uses an in-process event bus. Run a **single instance**, or swap
`src/lib/pubsub.ts` to Redis before scaling out. Webhooks are processed inline.
Move them to a queue once volume approaches GitHub's 10-second timeout.

## Run locally

```bash
cp .env.example .env              # dev login is on by default
createdb guildhall                # or use docker: postgres:16
npm install
npm run db:migrate
npm run db:seed                   # demo people, 2 projects, replayed webhooks
npm run dev                       # http://localhost:3000 → Sign in → pick a demo user
```

To use real GitHub, register the app with [docs/github-app.md](docs/github-app.md).

## Test

```bash
createdb guildhall_test
npm run lint      # tsc
npm test          # unit + webhook integration tests (uses DATABASE_URL, default guildhall_test)
npm run build
```

## Layout

```
src/app/            routes: /people, /projects, /p/[slug]/{workspace,tasks,milestones,roles,updates,digest,settings}
src/app/actions/    server actions (all authorisation happens here)
src/app/api/        GitHub OAuth callback, webhook, SSE stream, dev login
src/lib/github/     events.ts (pure webhook → effects), apply.ts (DB), client.ts (Octokit), templates.ts
src/lib/            taxonomy, stages, gap analysis, digest, access control, messages
src/db/schema.ts    Drizzle schema, with migrations in drizzle/
```
