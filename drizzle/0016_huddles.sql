CREATE TABLE "huddle_captions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"huddle_id" uuid NOT NULL,
	"user_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "huddle_participants" (
	"huddle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"connections" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "huddle_participants_huddle_id_user_id_pk" PRIMARY KEY("huddle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "huddles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"started_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"recap" jsonb,
	"recap_message_id" uuid
);
--> statement-breakpoint
ALTER TABLE "huddle_captions" ADD CONSTRAINT "huddle_captions_huddle_id_huddles_id_fk" FOREIGN KEY ("huddle_id") REFERENCES "public"."huddles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_captions" ADD CONSTRAINT "huddle_captions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_participants" ADD CONSTRAINT "huddle_participants_huddle_id_huddles_id_fk" FOREIGN KEY ("huddle_id") REFERENCES "public"."huddles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_participants" ADD CONSTRAINT "huddle_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddles" ADD CONSTRAINT "huddles_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddles" ADD CONSTRAINT "huddles_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "huddle_captions_idx" ON "huddle_captions" USING btree ("huddle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "huddles_one_active_idx" ON "huddles" USING btree ("channel_id") WHERE "huddles"."ended_at" is null;