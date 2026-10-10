export function verificationHeaders(origin: string): Record<string, string> {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return new URL(origin).hostname.endsWith('.vercel.app') && token
    ? { 'x-vercel-trusted-oidc-idp-token': token }
    : {};
}
