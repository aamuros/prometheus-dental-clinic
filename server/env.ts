// Server-only contracts; no generated platform globals or browser imports.
export type ServerEnv = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
};

export function serverEnv(
  source: NodeJS.ProcessEnv,
  requestOrigin: string,
): ServerEnv {
  let authOrigin = source.BETTER_AUTH_URL ?? '';
  if (source.VERCEL_ENV === 'preview') {
    // Trust only platform-supplied deployment hosts, never client Host/Origin.
    const origins = [source.VERCEL_URL, source.VERCEL_BRANCH_URL]
      .filter(
        (host): host is string =>
          !!host && /^[a-z0-9-]+\.vercel\.app$/.test(host),
      )
      .map((host) => `https://${host}`);
    authOrigin =
      origins.find((origin) => origin === requestOrigin) ?? origins[0] ?? '';
  }
  return {
    DATABASE_URL: source.DATABASE_URL ?? '',
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET ?? '',
    BETTER_AUTH_URL: authOrigin,
  };
}
