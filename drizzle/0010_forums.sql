CREATE TYPE "public"."topic_status" AS ENUM('open', 'accepted', 'parked', 'done');--> statement-breakpoint
ALTER TYPE "public"."channel_kind" ADD VALUE 'forum';--> statement-breakpoint
CREATE TABLE "message_votes" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_votes_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "topic_status" "topic_status";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "converted_task_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "converted_url" text;--> statement-breakpoint
ALTER TABLE "message_votes" ADD CONSTRAINT "message_votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_votes" ADD CONSTRAINT "message_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;