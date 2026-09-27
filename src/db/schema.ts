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
export const channelKindEnum = pgEnum("channel_kind", ["chat", "github"]);
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
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channels_project_name_idx").on(t.projectId, t.name)],
);

/** A card attached to a message, e.g. a GitHub PR or issue. Rendered by the client. */
export type MessageCard = {
  kind: "pull_request" | "issue" | "push" | "release" | "check" | "digest";
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
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tasks_gh_issue_idx").on(t.projectId, t.ghRepoId, t.ghIssueNumber)],
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
