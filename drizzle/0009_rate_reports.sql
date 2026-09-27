CREATE TABLE "rate_reports" (
	"user_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"seniority" "seniority" NOT NULL,
	"region" text NOT NULL,
	"hourly_usd_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_reports_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "rate_reports" ADD CONSTRAINT "rate_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_reports_skill_idx" ON "rate_reports" USING btree ("skill_id");