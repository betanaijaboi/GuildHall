CREATE TYPE "public"."feedback_kind" AS ENUM('bug', 'feedback', 'idea');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('form', 'sdk', 'discord');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'issue', 'task', 'dismissed');--> statement-breakpoint
CREATE TABLE "feedback_keys" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"playtest_id" uuid,
	"source" "feedback_source" NOT NULL,
	"kind" "feedback_kind" DEFAULT 'feedback' NOT NULL,
	"reporter_id" uuid,
	"reporter_name" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"build" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"screenshot_key" text,
	"screenshot_mime" text,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"issue_url" text,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playtest_testers" (
	"playtest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playtest_testers_playtest_id_user_id_pk" PRIMARY KEY("playtest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "playtests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"build_url" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_testers" integer DEFAULT 50 NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_keys" ADD CONSTRAINT "feedback_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_keys" ADD CONSTRAINT "feedback_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_playtest_id_playtests_id_fk" FOREIGN KEY ("playtest_id") REFERENCES "public"."playtests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_testers" ADD CONSTRAINT "playtest_testers_playtest_id_playtests_id_fk" FOREIGN KEY ("playtest_id") REFERENCES "public"."playtests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_testers" ADD CONSTRAINT "playtest_testers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtests" ADD CONSTRAINT "playtests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtests" ADD CONSTRAINT "playtests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_project_idx" ON "feedback_reports" USING btree ("project_id","created_at");