import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    contactNumber: varchar('contact_number', { length: 30 }).notNull(),
    email: varchar('email', { length: 254 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    check('patients_name_not_empty', sql`length(trim(${table.name})) > 0`),
    check(
      'patients_contact_not_empty',
      sql`length(trim(${table.contactNumber})) > 0`,
    ),
    index('patients_active_name_idx')
      .on(table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
  ],
);
