import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const availabilityEnum = pgEnum("availability", ["open", "limited", "busy"]);
export const seniorityEnum = pgEnum("seniority", ["student", "junior", "mid", "senior", "lead", "director"]);
export const stageEnum = pgEnum("stage", [
  "concept",
  "preproduction",
  "prototype",
  "vertical_slice",
  "production",
  "alpha",
  "beta",
  "launch",
  "live",
]);
export const visibilityEnum = pgEnum("visibility", ["public", "private"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "lead", "member", "contractor", "guest"]);
export const listingStatusEnum = pgEnum("listing_status", ["open", "filled", "closed"]);
export const applicationStatusEnum = pgEnum("application_status", ["pending", "accepted", "declined"]);
export const channelKindEnum = pgEnum("channel_kind", ["chat", "github", "forum"]);
export const topicStatusEnum = pgEnum("topic_status", ["open", "accepted", "parked", "done"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "doing", "done"]);
export const postVisibilityEnum = pgEnum("post_visibility", ["team", "public"]);

export const users = pgTable("users", {
  id: id(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  /** Avatar builder config (see src/lib/avatar.ts); null means the handle's generated default. */
  avatar: jsonb("avatar"),
  bio: text("bio").notNull().default(""),
  headline: text("headline").notNull().default(""),
  timezone: text("timezone"),
  availability: availabilityEnum("availability").notNull().default("open"),
  seniority: seniorityEnum("seniority"),
  engines: text("engines").array().notNull().default(sql`'{}'::text[]`),
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
  engagements: text("engagements").array().notNull().default(sql`'{}'::text[]`),
  tools: text("tools").array().notNull().default(sql`'{}'::text[]`),
  githubId: bigint("github_id", { mode: "number" }).unique(),
  githubLogin: text("github_login"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const profileSkills = pgTable(
  "profile_skills",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    level: integer("level").notNull().default(3),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] }), index("profile_skills_skill_idx").on(t.skillId)],
);

export const portfolioItems = pgTable("portfolio_items", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description").notNull().default(""),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  pitch: text("pitch").notNull().default(""),
  engine: text("engine").notNull(),
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
  genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
  stage: stageEnum("stage").notNull().default("concept"),
  visibility: visibilityEnum("visibility").notNull().default("public"),
  engagement: text("engagement").notNull().default("revshare"),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    skillId: text("skill_id"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const roleListings = pgTable("role_listings", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  engagement: text("engagement").notNull(),
  hoursPerWeek: integer("hours_per_week"),
  compensation: text("compensation").notNull().default(""),
  status: listingStatusEnum("status").notNull().default("open"),
  createdAt: createdAt(),
});

export const applications = pgTable(
  "applications",
  {
    id: id(),
    listingId: uuid("listing_id").notNull().references(() => roleListings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    status: applicationStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("applications_listing_user_idx").on(t.listingId, t.userId)],
);

export const channels = pgTable(
  "channels",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: channelKindEnum("kind").notNull().default("chat"),
    /** A GDD page pinned to the channel header, e.g. the art bible in #art (C7). */
    pinnedPageId: uuid("pinned_page_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channels_project_name_idx").on(t.projectId, t.name)],
);

/** A card attached to a message, e.g. a GitHub PR or issue. Rendered by the client. */
export type MessageCard = {
  kind: "pull_request" | "issue" | "push" | "release" | "check" | "digest" | "asset" | "huddle";
  title: string;
  url?: string;
  repo?: string;
  number?: number;
  state?: string;
  actor?: string;
  lines?: string[];
};

export const messages = pgTable(
  "messages",
  {
    id: id(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    // null author = posted by the Guildhall bot (GitHub events, digests).
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    threadRootId: uuid("thread_root_id"),
    body: text("body").notNull(),
    card: jsonb("card").$type<MessageCard>(),
    // Stable key for bot messages that should be threaded together, e.g. "pr:123:7".
    threadKey: text("thread_key"),
    /** Forum topics (C13): root messages in forum channels carry a title, tags and a status. */
    title: text("title"),
    tags: text("tags").array(),
    topicStatus: topicStatusEnum("topic_status"),
    convertedTaskId: uuid("converted_task_id"),
    convertedUrl: text("converted_url"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_channel_created_idx").on(t.channelId, t.createdAt),
    index("messages_thread_key_idx").on(t.channelId, t.threadKey),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("todo"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    ghRepoId: bigint("gh_repo_id", { mode: "number" }),
    ghIssueNumber: integer("gh_issue_number"),
    ghUrl: text("gh_url"),
    /** Set when the task is a stage of an asset pipeline (C6). */
    pipelineItemId: uuid("pipeline_item_id").references(() => pipelineItems.id, { onDelete: "cascade" }),
    stageIndex: integer("stage_index"),
    /** AI coding agent (C22): null unless a lead handed this task to the agent. */
    agentStatus: text("agent_status").$type<"requested" | "pr_open" | "merged" | "closed">(),
    agentPrUrl: text("agent_pr_url"),
    agentRequestedBy: uuid("agent_requested_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tasks_gh_issue_idx").on(t.projectId, t.ghRepoId, t.ghIssueNumber), index("tasks_pipeline_idx").on(t.pipelineItemId, t.stageIndex)],
);

export type ChecklistItem = { text: string; done: boolean };

export const milestones = pgTable("milestones", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stage: stageEnum("stage").notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const posts = pgTable("posts", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  visibility: postVisibilityEnum("visibility").notNull().default("team"),
  createdAt: createdAt(),
});

export const githubInstallations = pgTable("github_installations", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  installedByUserId: uuid("installed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: createdAt(),
});

export const projectRepos = pgTable(
  "project_repos",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    /** PR that adds the AI agent workflow (C22). */
    agentSetupUrl: text("agent_setup_url"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.repoId] }), index("project_repos_repo_idx").on(t.repoId)],
);

export const githubActivity = pgTable(
  "github_activity",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorLogin: text("actor_login"),
    title: text("title").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [index("github_activity_project_created_idx").on(t.projectId, t.createdAt)],
);

/** Webhook deliveries already processed, so GitHub redeliveries are idempotent. */
export const githubDeliveries = pgTable("github_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: createdAt(),
});

// --- Asset review (C2) -----------------------------------------------------------------------

export const assetKindEnum = pgEnum("asset_kind", ["image", "video", "model"]);
export const assetStatusEnum = pgEnum("asset_status", ["in_review", "changes_requested", "approved"]);
export const reviewDecisionEnum = pgEnum("review_decision", ["approved", "changes_requested"]);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: assetKindEnum("kind").notNull(),
    status: assetStatusEnum("status").notNull().default("in_review"),
    /** Optional path of the source file in the linked repo, for LFS lock status. */
    repoPath: text("repo_path"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assets_project_updated_idx").on(t.projectId, t.updatedAt)],
);

export const assetVersions = pgTable(
  "asset_versions",
  {
    id: id(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fileKey: text("file_key").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    note: text("note").notNull().default(""),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("asset_versions_asset_version_idx").on(t.assetId, t.version)],
);

/**
 * A pinned comment. Images/videos use normalised x/y (0–1) of the frame; videos add timeSec;
 * models store a surface point from <model-viewer> as "x y z" (plus its normal).
 */
export const assetComments = pgTable(
  "asset_comments",
  {
    id: id(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull().references(() => assetVersions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    x: real("x"),
    y: real("y"),
    timeSec: real("time_sec"),
    position3d: text("position_3d"),
    normal3d: text("normal_3d"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("asset_comments_version_idx").on(t.versionId)],
);

export const assetReviews = pgTable("asset_reviews", {
  id: id(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => assetVersions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  decision: reviewDecisionEnum("decision").notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

// --- Conflict radar (C12) --------------------------------------------------------------------

export const fileTouches = pgTable(
  "file_touches",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    path: text("path").notNull(),
    branch: text("branch").notNull(),
    actorLogin: text("actor_login").notNull(),
    at: createdAt(),
  },
  (t) => [index("file_touches_project_at_idx").on(t.projectId, t.at), index("file_touches_path_idx").on(t.projectId, t.path)],
);

/** Last time the radar warned about a path, so each hotspot is announced at most once a week. */
export const conflictAlerts = pgTable(
  "conflict_alerts",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    lastWarnedAt: timestamp("last_warned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.path] })],
);

// --- Asset pipelines (C6) --------------------------------------------------------------------

/** One asset moving through a pipeline, e.g. "Captain Mara" through the character pipeline. */
export const pipelineItems = pgTable(
  "pipeline_items",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    template: text("template").notNull(),
    stages: jsonb("stages").$type<string[]>().notNull(),
    /** Optional link to an asset under review; approving it completes the current stage. */
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    ghParentIssueNumber: integer("gh_parent_issue_number"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("pipeline_items_project_idx").on(t.projectId)],
);

// --- Contracts & escrowed milestones (C3, C24) -------------------------------------------------

export const engagementKindEnum = pgEnum("engagement_kind", ["work_for_hire", "revshare"]);
export const engagementStatusEnum = pgEnum("engagement_status", ["draft", "sent", "active", "completed", "cancelled"]);
export const pricingModelEnum = pgEnum("pricing_model", ["percent", "flat"]);
export const milestonePayStatusEnum = pgEnum("milestone_pay_status", ["unfunded", "funding", "funded", "released", "disputed", "refunded"]);

export const engagements = pgTable(
  "engagements",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => users.id),
    makerId: uuid("maker_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    kind: engagementKindEnum("kind").notNull(),
    status: engagementStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("usd"),
    pricingModel: pricingModelEnum("pricing_model").notNull().default("percent"),
    /** Structured terms (see src/lib/contracts.ts) — editable while draft. */
    terms: jsonb("terms").notNull(),
    /** Frozen rendered text + hash once sent; signatures bind to the hash. */
    contractText: text("contract_text"),
    contractHash: text("contract_hash"),
    makerSignedName: text("maker_signed_name"),
    makerSignedAt: timestamp("maker_signed_at", { withTimezone: true }),
    clientSignedName: text("client_signed_name"),
    clientSignedAt: timestamp("client_signed_at", { withTimezone: true }),
    flatFeePaid: boolean("flat_fee_paid").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("engagements_project_idx").on(t.projectId)],
);

export const engagementMilestones = pgTable("engagement_milestones", {
  id: id(),
  engagementId: uuid("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  amountCents: integer("amount_cents"),
  /** Approving this asset review releases the milestone. */
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  status: milestonePayStatusEnum("status").notNull().default("unfunded"),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  paymentRef: text("payment_ref"),
  transferRef: text("transfer_ref"),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
});

/** A maker's payout account with the payment provider (Stripe Connect Express, or the dev simulator). */
export const payoutAccounts = pgTable("payout_accounts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accountId: text("account_id").notNull(),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  createdAt: createdAt(),
});

/** Reviews both parties leave after an engagement completes (input to Guild Rank). */
export const engagementReviews = pgTable(
  "engagement_reviews",
  {
    id: id(),
    engagementId: uuid("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    fromId: uuid("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toId: uuid("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("engagement_reviews_once_idx").on(t.engagementId, t.fromId)],
);

/** Provider webhook events already processed (idempotency). */
export const paymentEvents = pgTable("payment_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: createdAt(),
});

// --- Service gigs (C10) ------------------------------------------------------------------------

export const gigStatusEnum = pgEnum("gig_status", ["active", "paused"]);
export const gigTierEnum = pgEnum("gig_tier", ["basic", "standard", "premium"]);

export const gigs = pgTable(
  "gigs",
  {
    id: id(),
    sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    skillId: text("skill_id").notNull(),
    engines: text("engines").array().notNull().default(sql`'{}'::text[]`),
    description: text("description").notNull().default(""),
    /** Delivered formats, e.g. "FBX + textures (PBR, 2K)", "WAV 48kHz + FMOD bank". */
    formats: text("formats").notNull().default(""),
    coverUrl: text("cover_url"),
    currency: text("currency").notNull().default("usd"),
    status: gigStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("gigs_skill_idx").on(t.skillId)],
);

export const gigTiers = pgTable(
  "gig_tiers",
  {
    gigId: uuid("gig_id").notNull().references(() => gigs.id, { onDelete: "cascade" }),
    tier: gigTierEnum("tier").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    deliveryDays: integer("delivery_days").notNull(),
    revisions: integer("revisions").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.gigId, t.tier] })],
);

export const gigAddons = pgTable("gig_addons", {
  id: id(),
  gigId: uuid("gig_id").notNull().references(() => gigs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
});

export const gigOrders = pgTable("gig_orders", {
  id: id(),
  gigId: uuid("gig_id").notNull().references(() => gigs.id, { onDelete: "restrict" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  tier: gigTierEnum("tier").notNull(),
  addonIds: text("addon_ids").array().notNull().default(sql`'{}'::text[]`),
  totalCents: integer("total_cents").notNull(),
  brief: text("brief").notNull().default(""),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  engagementId: uuid("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

// --- Guild Rank (C1) ---------------------------------------------------------------------------

/** A skill endorsement from someone who has shared a project with the person. */
export const endorsements = pgTable(
  "endorsements",
  {
    fromId: uuid("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toId: uuid("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId, t.skillId] }), index("endorsements_to_idx").on(t.toId)],
);

// --- Shipped credits (C11) -----------------------------------------------------------------------

export const creditSourceEnum = pgEnum("credit_source", ["self", "guildhall"]);

export const credits = pgTable(
  "credits",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Lower-cased, punctuation-free title used to match teammates on the same game. */
    titleKey: text("title_key").notNull(),
    role: text("role").notNull(),
    year: integer("year"),
    externalUrl: text("external_url"),
    source: creditSourceEnum("source").notNull().default("self"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("credits_user_idx").on(t.userId), index("credits_title_key_idx").on(t.titleKey), uniqueIndex("credits_project_user_idx").on(t.projectId, t.userId)],
);

/** A teammate who also worked on the title vouching for a self-reported credit. */
export const creditConfirmations = pgTable(
  "credit_confirmations",
  {
    creditId: uuid("credit_id").notNull().references(() => credits.id, { onDelete: "cascade" }),
    confirmerId: uuid("confirmer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.creditId, t.confirmerId] })],
);

// --- Rate transparency (C20) --------------------------------------------------------------------

/** Opt-in, anonymous hourly rate report (USD cents). Only aggregates of 10+ are ever shown. */
export const rateReports = pgTable(
  "rate_reports",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    seniority: seniorityEnum("seniority").notNull(),
    region: text("region").notNull(),
    hourlyUsdCents: integer("hourly_usd_cents").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] }), index("rate_reports_skill_idx").on(t.skillId)],
);

// --- Forum votes (C13) -------------------------------------------------------------------------

export const messageVotes = pgTable(
  "message_votes",
  {
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

// --- Living GDD (C7) -----------------------------------------------------------------------------

export const gddPages = pgTable(
  "gdd_pages",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default("📄"),
    body: text("body").notNull().default(""),
    position: integer("position").notNull().default(0),
    /** Incremented on every save; editors must present the version they opened. */
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("gdd_pages_project_idx").on(t.projectId, t.parentId, t.position)],
);

export const gddLinkTypeEnum = pgEnum("gdd_link_type", ["task", "pipeline", "asset"]);

export const gddLinks = pgTable(
  "gdd_links",
  {
    pageId: uuid("page_id").notNull().references(() => gddPages.id, { onDelete: "cascade" }),
    targetType: gddLinkTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.targetType, t.targetId] })],
);

// --- Your hand (C19) -----------------------------------------------------------------------------

/** A person's own ordering of their cross-project queue. Items missing here sort by priority. */
export const handOrder = pgTable(
  "hand_order",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemKey] })],
);

// --- Automations (C14) --------------------------------------------------------------------------

export const automations = pgTable(
  "automations",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** See src/lib/automations.ts for the trigger/action shapes. */
    trigger: jsonb("trigger").notNull(),
    action: jsonb("action").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    source: text("source").notNull().default("custom"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    fireCount: integer("fire_count").notNull().default(0),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("automations_project_idx").on(t.projectId)],
);

// --- Guests & shared channels (C15) --------------------------------------------------------------

/** Channels a guest may see (guests see nothing else in the workspace). */
export const channelAccess = pgTable(
  "channel_access",
  {
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

/** Assets shared with a guest for review. */
export const assetShares = pgTable(
  "asset_shares",
  {
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.userId] })],
);

export const guestInvites = pgTable("guest_invites", {
  tokenHash: text("token_hash").primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  channelIds: text("channel_ids").array().notNull(),
  assetIds: text("asset_ids").array().notNull().default(sql`'{}'::text[]`),
  maxUses: integer("max_uses").notNull().default(5),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** A channel owned by one project, also shown in another (cross-studio co-development). */
export const channelLinks = pgTable(
  "channel_links",
  {
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.projectId] })],
);

export const channelShareCodes = pgTable("channel_share_codes", {
  codeHash: text("code_hash").primaryKey(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
});

// --- Huddles + recaps (C5) ----------------------------------------------------------------------

export type HuddleAction = { title: string; owner: string | null; taskId?: string };
export type HuddleRecap = { summary: string; decisions: string[]; actions: HuddleAction[]; source: "ai" | "rules" };

/** A live voice/video call in a channel. At most one active huddle per channel. */
export const huddles = pgTable(
  "huddles",
  {
    id: id(),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: createdAt(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Shared notes typed during the call. */
    notes: text("notes").notNull().default(""),
    recap: jsonb("recap").$type<HuddleRecap>(),
    recapMessageId: uuid("recap_message_id"),
  },
  (t) => [uniqueIndex("huddles_one_active_idx").on(t.channelId).where(sql`${t.endedAt} is null`)],
);

export const huddleParticipants = pgTable(
  "huddle_participants",
  {
    huddleId: uuid("huddle_id").notNull().references(() => huddles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    /** Open event-stream connections; a participant has left when this reaches 0. */
    connections: integer("connections").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.huddleId, t.userId] })],
);

/** Opt-in live captions (transcribed in each speaker's own browser), used for the recap. */
export const huddleCaptions = pgTable(
  "huddle_captions",
  {
    id: id(),
    huddleId: uuid("huddle_id").notNull().references(() => huddles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    at: createdAt(),
  },
  (t) => [index("huddle_captions_idx").on(t.huddleId, t.at)],
);

// --- Jam mode (C4) -------------------------------------------------------------------------------

/** A game jam hosted on Guildhall, or mirrored from itch.io (`itchUrl`) for team formation. */
export const jams = pgTable("jams", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** Revealed to everyone when the jam starts; the host always sees it. */
  theme: text("theme").notNull().default(""),
  hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
  itchUrl: text("itch_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  maxTeamSize: integer("max_team_size").notNull().default(4),
  createdAt: createdAt(),
});

/** "Looking for a team" posts on a jam's board. */
export const jamSeekers = pgTable(
  "jam_seekers",
  {
    jamId: uuid("jam_id").notNull().references(() => jams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.jamId, t.userId] })],
);

/** A jam team; its workspace is an ordinary Guildhall project, time-boxed by the jam. */
export const jamTeams = pgTable(
  "jam_teams",
  {
    id: id(),
    jamId: uuid("jam_id").notNull().references(() => jams.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
    lookingFor: text("looking_for").array().notNull().default(sql`'{}'::text[]`),
    submissionUrl: text("submission_url"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Deadline reminders already posted (index into REMINDERS). */
    remindersSent: integer("reminders_sent").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("jam_teams_jam_idx").on(t.jamId)],
);

export const jamRequestStatusEnum = pgEnum("jam_request_status", ["pending", "accepted", "declined"]);

export const jamRequests = pgTable(
  "jam_requests",
  {
    teamId: uuid("team_id").notNull().references(() => jamTeams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    status: jamRequestStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

// --- Playtests + player feedback (C8/C9) ----------------------------------------------------------

export type PlaytestQuestion = { id: string; kind: "rating" | "text" | "choice"; prompt: string; options: string[] };

export const playtests = pgTable("playtests", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Build to play. Empty = use the latest GitHub release posted to the project. */
  buildUrl: text("build_url"),
  questions: jsonb("questions").$type<PlaytestQuestion[]>().notNull().default(sql`'[]'::jsonb`),
  maxTesters: integer("max_testers").notNull().default(50),
  open: boolean("open").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const playtestTesters = pgTable(
  "playtest_testers",
  {
    playtestId: uuid("playtest_id").notNull().references(() => playtests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default(""),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playtestId, t.userId] })],
);

export const feedbackSourceEnum = pgEnum("feedback_source", ["form", "sdk", "discord"]);
export const feedbackKindEnum = pgEnum("feedback_kind", ["bug", "feedback", "idea"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["new", "issue", "task", "dismissed"]);

export const feedbackReports = pgTable(
  "feedback_reports",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    playtestId: uuid("playtest_id").references(() => playtests.id, { onDelete: "set null" }),
    source: feedbackSourceEnum("source").notNull(),
    kind: feedbackKindEnum("kind").notNull().default("feedback"),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reporterName: text("reporter_name").notNull().default(""),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    answers: jsonb("answers").$type<Record<string, string | number>>().notNull().default(sql`'{}'::jsonb`),
    build: text("build").notNull().default(""),
    platform: text("platform").notNull().default(""),
    screenshotKey: text("screenshot_key"),
    screenshotMime: text("screenshot_mime"),
    status: feedbackStatusEnum("status").notNull().default("new"),
    issueUrl: text("issue_url"),
    taskId: uuid("task_id"),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_project_idx").on(t.projectId, t.createdAt)],
);

/** Keys a game build uses to send in-game reports. Stored hashed; shown once. */
export const feedbackKeys = pgTable("feedback_keys", {
  keyHash: text("key_hash").primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// --- Public roadmap + voting (C18) -------------------------------------------------------------------

export const roadmapColumnEnum = pgEnum("roadmap_column", ["now", "next", "later", "shipped"]);

export const roadmapItems = pgTable(
  "roadmap_items",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    column: roadmapColumnEnum("column").notNull().default("later"),
    /** Hidden items are visible to the team only (e.g. unannounced features). */
    public: boolean("public").notNull().default(true),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("roadmap_project_idx").on(t.projectId)],
);

export const roadmapVotes = pgTable(
  "roadmap_votes",
  {
    itemId: uuid("item_id").notNull().references(() => roadmapItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] })],
);
