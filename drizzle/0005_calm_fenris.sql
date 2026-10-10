CREATE TABLE "staff_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_audit_action_check" CHECK ("staff_audit"."action" in ('deactivate', 'reactivate', 'revoke-sessions', 'change-password', 'recover-password'))
);
--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "password_change_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_audit" ADD CONSTRAINT "staff_audit_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit" ADD CONSTRAINT "staff_audit_target_id_auth_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_audit_target_date_idx" ON "staff_audit" USING btree ("target_id","created_at");