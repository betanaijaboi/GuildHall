CREATE TYPE "public"."gdd_link_type" AS ENUM('task', 'pipeline', 'asset');--> statement-breakpoint
CREATE TABLE "gdd_links" (
	"page_id" uuid NOT NULL,
	"target_type" "gdd_link_type" NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "gdd_links_page_id_target_type_target_id_pk" PRIMARY KEY("page_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "gdd_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"emoji" text DEFAULT '📄' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "pinned_page_id" uuid;--> statement-breakpoint
ALTER TABLE "gdd_links" ADD CONSTRAINT "gdd_links_page_id_gdd_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."gdd_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gdd_pages" ADD CONSTRAINT "gdd_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gdd_pages" ADD CONSTRAINT "gdd_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gdd_pages_project_idx" ON "gdd_pages" USING btree ("project_id","parent_id","position");