// Only fixed configuration names and reasons may enter operational logs.
export class ConfigurationError extends Error {
  constructor(
    readonly variable:
      'DATABASE_URL' | 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL',
    readonly reason: 'missing' | 'invalid',
  ) {
    super(`${variable} is ${reason}`);
  }
}
