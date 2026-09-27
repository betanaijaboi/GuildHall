CREATE TYPE "public"."moodboard_item_kind" AS ENUM('image', 'portfolio', 'asset', 'color', 'note');--> statement-breakpoint
CREATE TABLE "moodboard_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"kind" "moodboard_item_kind" NOT NULL,
	"url" text,
	"caption" text DEFAULT '' NOT NULL,
	"color" text,
	"portfolio_item_id" uuid,
	"asset_id" uuid,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moodboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_board_id_moodboards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."moodboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_portfolio_item_id_portfolio_items_id_fk" FOREIGN KEY ("portfolio_item_id") REFERENCES "public"."portfolio_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboards" ADD CONSTRAINT "moodboards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moodboard_items_board_idx" ON "moodboard_items" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moodboard_items_portfolio_idx" ON "moodboard_items" USING btree ("board_id","portfolio_item_id");