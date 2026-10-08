ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinical_reference_unique" UNIQUE("id","patient_id","dentist_id");
--> statement-breakpoint
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_appointment_patient_dentist_fk" FOREIGN KEY ("appointment_id","patient_id","dentist_id") REFERENCES "public"."appointments"("id","patient_id","dentist_id") ON DELETE restrict ON UPDATE restrict;
