CREATE TABLE "dental_record_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dental_record_history_record_version_unique" UNIQUE("record_id","version")
);
--> statement-breakpoint
CREATE TABLE "dental_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" varchar(20) NOT NULL,
	"clinical_notes" varchar(4000),
	"diagnosis" varchar(2000),
	"procedures" varchar(2000),
	"tooth_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"treatment_date" date NOT NULL,
	"dentist_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dental_records_kind_check" CHECK ("dental_records"."kind" in ('note', 'treatment')),
	CONSTRAINT "dental_records_content_check" CHECK (("dental_records"."kind" = 'note' and coalesce(length(trim("dental_records"."clinical_notes")), 0) > 0) or ("dental_records"."kind" = 'treatment' and coalesce(length(trim("dental_records"."procedures")), 0) > 0)),
	CONSTRAINT "dental_records_version_check" CHECK ("dental_records"."version" > 0),
	CONSTRAINT "dental_records_teeth_check" CHECK ("dental_records"."tooth_numbers" <@ ARRAY[11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48,51,52,53,54,55,61,62,63,64,65,71,72,73,74,75,81,82,83,84,85]::integer[])
);
--> statement-breakpoint
ALTER TABLE "dental_record_history" ADD CONSTRAINT "dental_record_history_record_id_dental_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."dental_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_record_history" ADD CONSTRAINT "dental_record_history_changed_by_auth_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_dentist_id_auth_user_id_fk" FOREIGN KEY ("dentist_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dental_records_patient_date_idx" ON "dental_records" USING btree ("patient_id","kind","treatment_date","id");
--> statement-breakpoint
-- Drizzle does not model triggers. Keep the audit write atomic with each record
-- write; a failed history insert rolls back the entire clinical change.
CREATE FUNCTION audit_dental_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.created_by <> NEW.updated_by THEN
      RAISE EXCEPTION 'Invalid initial clinical revision' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.patient_id <> OLD.patient_id OR NEW.kind <> OLD.kind
       OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
       OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Invalid clinical revision' USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO dental_record_history (record_id, version, snapshot, changed_by, changed_at)
  VALUES (NEW.id, NEW.version, jsonb_build_object(
    'patientId', NEW.patient_id, 'appointmentId', NEW.appointment_id,
    'kind', NEW.kind, 'clinicalNotes', NEW.clinical_notes,
    'diagnosis', NEW.diagnosis, 'procedures', NEW.procedures,
    'toothNumbers', NEW.tooth_numbers, 'treatmentDate', NEW.treatment_date,
    'dentistId', NEW.dentist_id
  ), NEW.updated_by, NEW.updated_at);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dental_records_audit AFTER INSERT OR UPDATE ON dental_records
FOR EACH ROW EXECUTE FUNCTION audit_dental_record();
