import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '../../db/schema.js';

export const staffAudit = pgTable(
  'staff_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    targetId: text('target_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'staff_audit_action_check',
      sql`${table.action} in ('deactivate', 'reactivate', 'revoke-sessions', 'change-password', 'recover-password')`,
    ),
    index('staff_audit_target_date_idx').on(table.targetId, table.createdAt),
  ],
);
