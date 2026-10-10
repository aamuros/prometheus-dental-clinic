import type { ServerEnv } from '../../env.js';
import { betterAuth } from 'better-auth/minimal';
import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { adminAc, defaultAc } from 'better-auth/plugins/admin/access';
import { createDatabase } from '../../db/client.js';
import * as schema from '../../db/schema.js';

// Shared by credential-free tests; the server always supplies Drizzle.
export function authOptions(
  env: Pick<ServerEnv, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL'>,
) {
  const origin = new URL(env.BETTER_AUTH_URL);
  if (
    origin.origin !== env.BETTER_AUTH_URL ||
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      ))
  ) {
    throw new Error(
      'BETTER_AUTH_URL must be an HTTPS origin (HTTP is allowed only on localhost)',
    );
  }
  if (env.BETTER_AUTH_SECRET.length < 32)
    throw new Error('A strong auth secret is required');
  return {
    appName: 'Prometheus Dental Clinic',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        isDentist: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database' as const,
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
    advanced: {
      useSecureCookies: origin.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const },
      ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for'] },
    },
    logger: { disabled: true },
    // Unexpected adapter errors must reach Hono's safe handler instead of
    // better-call's fallback, which logs the raw exception.
    onAPIError: { throw: true },
    telemetry: { enabled: false },
    plugins: [
      admin({
        defaultRole: 'staff',
        adminRoles: ['admin'],
        roles: { admin: adminAc, staff: defaultAc.newRole({}) },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(env: ServerEnv) {
  return betterAuth({
    ...authOptions(env),
    // Neon's HTTP adapter cannot use interactive transactions.
    database: drizzleAdapter(createDatabase(env), {
      provider: 'pg',
      schema,
      transaction: false,
    }),
  });
}
