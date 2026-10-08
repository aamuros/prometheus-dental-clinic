import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AppointmentStatus } from '../../../shared/appointments';
import { user } from '../../db/schema';
import { patients } from '../patients/schema';

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    dentistId: text('dentist_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<AppointmentStatus>()
      .notNull()
      .default('scheduled'),
    notes: varchar('notes', { length: 2000 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('appointments_clinical_reference_unique').on(
      table.id,
      table.patientId,
      table.dentistId,
    ),
    check('appointments_time_order', sql`${table.endAt} > ${table.startAt}`),
    check(
      'appointments_status_check',
      sql`${table.status} in ('scheduled', 'completed', 'cancelled', 'no-show')`,
    ),
    index('appointments_start_idx').on(table.startAt, table.id),
    index('appointments_patient_idx').on(table.patientId),
    // Drizzle Kit does not model exclusion constraints. The generated migration
    // adds appointments_dentist_overlap using btree_gist and half-open ranges.
  ],
);
