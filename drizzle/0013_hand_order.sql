CREATE TABLE "hand_order" (
	"user_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "hand_order_user_id_item_key_pk" PRIMARY KEY("user_id","item_key")
);
--> statement-breakpoint
ALTER TABLE "hand_order" ADD CONSTRAINT "hand_order_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;