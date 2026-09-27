ALTER TABLE "project_repos" ADD COLUMN "agent_setup_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_pr_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_requested_by_users_id_fk" FOREIGN KEY ("agent_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;