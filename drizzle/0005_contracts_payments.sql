CREATE TYPE "public"."engagement_kind" AS ENUM('work_for_hire', 'revshare');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('draft', 'sent', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."milestone_pay_status" AS ENUM('unfunded', 'funding', 'funded', 'released', 'disputed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('percent', 'flat');--> statement-breakpoint
CREATE TABLE "engagement_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer,
	"asset_id" uuid,
	"status" "milestone_pay_status" DEFAULT 'unfunded' NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"payment_ref" text,
	"transfer_ref" text,
	"funded_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"dispute_reason" text
);
--> statement-breakpoint
CREATE TABLE "engagement_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"maker_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "engagement_kind" NOT NULL,
	"status" "engagement_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"pricing_model" "pricing_model" DEFAULT 'percent' NOT NULL,
	"terms" jsonb NOT NULL,
	"contract_text" text,
	"contract_hash" text,
	"maker_signed_name" text,
	"maker_signed_at" timestamp with time zone,
	"client_signed_name" text,
	"client_signed_at" timestamp with time zone,
	"flat_fee_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_milestones" ADD CONSTRAINT "engagement_milestones_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_milestones" ADD CONSTRAINT "engagement_milestones_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_reviews" ADD CONSTRAINT "engagement_reviews_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_reviews" ADD CONSTRAINT "engagement_reviews_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_reviews" ADD CONSTRAINT "engagement_reviews_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_maker_id_users_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_reviews_once_idx" ON "engagement_reviews" USING btree ("engagement_id","from_id");--> statement-breakpoint
CREATE INDEX "engagements_project_idx" ON "engagements" USING btree ("project_id");