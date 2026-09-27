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
| **Team gaps** | Compares the roster with the roles the current stage needs, and suggests people ranked by skill, engine and availability |

**Not in the MVP yet** (see the build order in the vault's competitor-components.md): voice/video, two-way issue sync, Discord bridge, desktop and
mobile apps, verified skill badges beyond the merged-PR count, and direct
invites.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · PostgreSQL + Drizzle ORM ·
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
