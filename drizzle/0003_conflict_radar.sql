CREATE TABLE "conflict_alerts" (
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"last_warned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conflict_alerts_project_id_path_pk" PRIMARY KEY("project_id","path")
);
--> statement-breakpoint
CREATE TABLE "file_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"path" text NOT NULL,
	"branch" text NOT NULL,
	"actor_login" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conflict_alerts" ADD CONSTRAINT "conflict_alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_touches" ADD CONSTRAINT "file_touches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_touches_project_at_idx" ON "file_touches" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "file_touches_path_idx" ON "file_touches" USING btree ("project_id","path");