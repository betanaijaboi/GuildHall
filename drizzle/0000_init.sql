CREATE TYPE "public"."application_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('open', 'limited', 'busy');--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('chat', 'github');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('open', 'filled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'lead', 'member', 'contractor', 'guest');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('team', 'public');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('student', 'junior', 'mid', 'senior', 'lead', 'director');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('concept', 'preproduction', 'prototype', 'vertical_slice', 'production', 'alpha', 'beta', 'launch', 'live');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "channel_kind" DEFAULT 'chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_login" text,
	"title" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"installed_by_user_id" uuid,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"skill_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid,
	"thread_root_id" uuid,
	"body" text NOT NULL,
	"card" jsonb,
	"thread_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"visibility" "post_visibility" DEFAULT 'team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_skills" (
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"level" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "profile_skills_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "project_repos" (
	"project_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"repo_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_repos_project_id_repo_id_pk" PRIMARY KEY("project_id","repo_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"pitch" text DEFAULT '' NOT NULL,
	"engine" text NOT NULL,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"stage" "stage" DEFAULT 'concept' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"engagement" text DEFAULT 'revshare' NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "role_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"engagement" text NOT NULL,
	"hours_per_week" integer,
	"compensation" text DEFAULT '' NOT NULL,
	"status" "listing_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"assignee_id" uuid,
	"gh_repo_id" bigint,
	"gh_issue_number" integer,
	"gh_url" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"bio" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"timezone" text,
	"availability" "availability" DEFAULT 'open' NOT NULL,
	"seniority" "seniority",
	"engines" text[] DEFAULT '{}'::text[] NOT NULL,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"engagements" text[] DEFAULT '{}'::text[] NOT NULL,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"github_id" bigint,
	"github_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_listing_id_role_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."role_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_activity" ADD CONSTRAINT "github_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_listings" ADD CONSTRAINT "role_listings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_listing_user_idx" ON "applications" USING btree ("listing_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_project_name_idx" ON "channels" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "github_activity_project_created_idx" ON "github_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_channel_created_idx" ON "messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_thread_key_idx" ON "messages" USING btree ("channel_id","thread_key");--> statement-breakpoint
CREATE INDEX "profile_skills_skill_idx" ON "profile_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "project_repos_repo_idx" ON "project_repos" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_gh_issue_idx" ON "tasks" USING btree ("project_id","gh_repo_id","gh_issue_number");