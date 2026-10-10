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
  const productionHost = source.VERCEL_PROJECT_PRODUCTION_URL;
  if (
    source.VERCEL_ENV === 'production' &&
    productionHost &&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(productionHost)
  ) {
    // The platform's canonical domain is trusted independently of a stale
    // configured origin. Never derive trusted origins from request headers.
    const productionOrigin = new URL(`https://${productionHost}`).origin;
    if (requestOrigin === productionOrigin || !authOrigin)
      authOrigin = productionOrigin;
  }
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
