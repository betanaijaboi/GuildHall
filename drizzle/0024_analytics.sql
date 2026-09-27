CREATE TYPE "public"."view_subject" AS ENUM('profile', 'project');--> statement-breakpoint
CREATE TABLE "portfolio_clicks" (
	"portfolio_item_id" uuid NOT NULL,
	"day" text NOT NULL,
	"visitor_hash" text NOT NULL,
	CONSTRAINT "portfolio_clicks_portfolio_item_id_day_visitor_hash_pk" PRIMARY KEY("portfolio_item_id","day","visitor_hash")
);
--> statement-breakpoint
CREATE TABLE "view_hits" (
	"subject_type" "view_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"day" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"views" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "view_hits_subject_type_subject_id_day_visitor_hash_pk" PRIMARY KEY("subject_type","subject_id","day","visitor_hash")
);
--> statement-breakpoint
ALTER TABLE "portfolio_clicks" ADD CONSTRAINT "portfolio_clicks_portfolio_item_id_portfolio_items_id_fk" FOREIGN KEY ("portfolio_item_id") REFERENCES "public"."portfolio_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "view_hits_subject_day_idx" ON "view_hits" USING btree ("subject_type","subject_id","day");