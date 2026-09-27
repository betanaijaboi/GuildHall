CREATE TYPE "public"."gig_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."gig_tier" AS ENUM('basic', 'standard', 'premium');--> statement-breakpoint
CREATE TABLE "gig_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gig_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gig_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gig_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"tier" "gig_tier" NOT NULL,
	"addon_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_cents" integer NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"project_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gig_tiers" (
	"gig_id" uuid NOT NULL,
	"tier" "gig_tier" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"delivery_days" integer NOT NULL,
	"revisions" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "gig_tiers_gig_id_tier_pk" PRIMARY KEY("gig_id","tier")
);
--> statement-breakpoint
CREATE TABLE "gigs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" text NOT NULL,
	"skill_id" text NOT NULL,
	"engines" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"formats" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "gig_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gig_addons" ADD CONSTRAINT "gig_addons_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_orders" ADD CONSTRAINT "gig_orders_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_orders" ADD CONSTRAINT "gig_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_orders" ADD CONSTRAINT "gig_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_orders" ADD CONSTRAINT "gig_orders_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_tiers" ADD CONSTRAINT "gig_tiers_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gigs_skill_idx" ON "gigs" USING btree ("skill_id");