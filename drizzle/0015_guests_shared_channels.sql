CREATE TABLE "asset_shares" (
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "asset_shares_asset_id_user_id_pk" PRIMARY KEY("asset_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_access" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "channel_access_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_links" (
	"channel_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_links_channel_id_project_id_pk" PRIMARY KEY("channel_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "channel_share_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "guest_invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"channel_ids" text[] NOT NULL,
	"asset_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_uses" integer DEFAULT 5 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_shares" ADD CONSTRAINT "asset_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_access" ADD CONSTRAINT "channel_access_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_access" ADD CONSTRAINT "channel_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_share_codes" ADD CONSTRAINT "channel_share_codes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_share_codes" ADD CONSTRAINT "channel_share_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invites" ADD CONSTRAINT "guest_invites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invites" ADD CONSTRAINT "guest_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;