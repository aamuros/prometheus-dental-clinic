import { sql } from 'drizzle-orm';
export { patients } from '../features/patients/schema.js';
export { appointments } from '../features/appointments/schema.js';
export {
  dentalRecords,
  dentalRecordHistory,
} from '../features/dental-records/schema.js';
export { staffAudit } from '../features/staff/schema.js';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    role: text('role').notNull().default('staff'),
    isDentist: boolean('is_dentist').notNull().default(false),
    passwordChangeRequired: boolean('password_change_required')
      .notNull()
      .default(false),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
  },
  (table) => [
    check('auth_user_role_check', sql`${table.role} in ('admin', 'staff')`),
  ],
);

export const session = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [index('auth_session_user_idx').on(table.userId)],
);

export const account = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('auth_account_user_idx').on(table.userId)],
);

export const verification = pgTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('auth_verification_identifier_idx').on(table.identifier)],
);

export const rateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: bigint('count', { mode: 'number' }).notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
