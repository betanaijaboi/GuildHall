CREATE TYPE "public"."credit_source" AS ENUM('self', 'guildhall');--> statement-breakpoint
CREATE TABLE "credit_confirmations" (
	"credit_id" uuid NOT NULL,
	"confirmer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_confirmations_credit_id_confirmer_id_pk" PRIMARY KEY("credit_id","confirmer_id")
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"role" text NOT NULL,
	"year" integer,
	"external_url" text,
	"source" "credit_source" DEFAULT 'self' NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_confirmations" ADD CONSTRAINT "credit_confirmations_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_confirmations" ADD CONSTRAINT "credit_confirmations_confirmer_id_users_id_fk" FOREIGN KEY ("confirmer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credits_user_idx" ON "credits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credits_title_key_idx" ON "credits" USING btree ("title_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credits_project_user_idx" ON "credits" USING btree ("project_id","user_id");