CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"birth_date" date NOT NULL,
	"contact_number" varchar(30) NOT NULL,
	"email" varchar(254),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "patients_name_not_empty" CHECK (length(trim("patients"."name")) > 0),
	CONSTRAINT "patients_contact_not_empty" CHECK (length(trim("patients"."contact_number")) > 0)
);
--> statement-breakpoint
CREATE INDEX "patients_active_name_idx" ON "patients" USING btree ("name","id") WHERE "patients"."archived_at" is null;