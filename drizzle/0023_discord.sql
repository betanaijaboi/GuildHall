CREATE TABLE "discord_link_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_links" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text DEFAULT '' NOT NULL,
	"linked_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_links_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_webhooks" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"webhook_url" text NOT NULL,
	"created_by" uuid,
	"last_error" text,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_link_codes" ADD CONSTRAINT "discord_link_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_links" ADD CONSTRAINT "discord_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;