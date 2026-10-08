import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  DentalRecordInput,
  DentalRecordKind,
} from '../../../shared/dental-records';
import { user } from '../../db/schema';
import { patients } from '../patients/schema';
import { appointments } from '../appointments/schema';

// Notes and completed treatments share one clinical record contract. Treatment
// history is the date-ordered treatment projection; revisions preserve both.
export const dentalRecords = pgTable(
  'dental_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'restrict',
    }),
    kind: varchar('kind', { length: 20 }).$type<DentalRecordKind>().notNull(),
    clinicalNotes: varchar('clinical_notes', { length: 4000 }),
    diagnosis: varchar('diagnosis', { length: 2000 }),
    procedures: varchar('procedures', { length: 2000 }),
    toothNumbers: integer('tooth_numbers')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    treatmentDate: date('treatment_date', { mode: 'string' }).notNull(),
    dentistId: text('dentist_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'dental_records_appointment_patient_dentist_fk',
      columns: [table.appointmentId, table.patientId, table.dentistId],
      foreignColumns: [
        appointments.id,
        appointments.patientId,
        appointments.dentistId,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(
      'dental_records_kind_check',
      sql`${table.kind} in ('note', 'treatment')`,
    ),
    check(
      'dental_records_content_check',
      sql`(${table.kind} = 'note' and coalesce(length(trim(${table.clinicalNotes})), 0) > 0) or (${table.kind} = 'treatment' and coalesce(length(trim(${table.procedures})), 0) > 0)`,
    ),
    check('dental_records_version_check', sql`${table.version} > 0`),
    check(
      'dental_records_teeth_check',
      sql`${table.toothNumbers} <@ ARRAY[11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48,51,52,53,54,55,61,62,63,64,65,71,72,73,74,75,81,82,83,84,85]::integer[]`,
    ),
    index('dental_records_patient_date_idx').on(
      table.patientId,
      table.kind,
      table.treatmentDate,
      table.id,
    ),
  ],
);

export const dentalRecordHistory = pgTable(
  'dental_record_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => dentalRecords.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<DentalRecordInput>().notNull(),
    changedBy: text('changed_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('dental_record_history_record_version_unique').on(
      table.recordId,
      table.version,
    ),
  ],
);
