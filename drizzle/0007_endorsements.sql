CREATE TABLE "endorsements" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endorsements_from_id_to_id_skill_id_pk" PRIMARY KEY("from_id","to_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endorsements_to_idx" ON "endorsements" USING btree ("to_id");