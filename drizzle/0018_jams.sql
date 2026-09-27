CREATE TYPE "public"."jam_request_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "jam_requests" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "jam_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jam_requests_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "jam_seekers" (
	"jam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jam_seekers_jam_id_user_id_pk" PRIMARY KEY("jam_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "jam_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jam_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"looking_for" text[] DEFAULT '{}'::text[] NOT NULL,
	"submission_url" text,
	"submitted_at" timestamp with time zone,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jam_teams_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "jams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	"host_id" uuid,
	"itch_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"max_team_size" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "jam_requests" ADD CONSTRAINT "jam_requests_team_id_jam_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."jam_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jam_requests" ADD CONSTRAINT "jam_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jam_seekers" ADD CONSTRAINT "jam_seekers_jam_id_jams_id_fk" FOREIGN KEY ("jam_id") REFERENCES "public"."jams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jam_seekers" ADD CONSTRAINT "jam_seekers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jam_teams" ADD CONSTRAINT "jam_teams_jam_id_jams_id_fk" FOREIGN KEY ("jam_id") REFERENCES "public"."jams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jam_teams" ADD CONSTRAINT "jam_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jams" ADD CONSTRAINT "jams_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jam_teams_jam_idx" ON "jam_teams" USING btree ("jam_id");