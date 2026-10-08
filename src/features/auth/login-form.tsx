import { useState, type SubmitEvent } from 'react';
import { useRouter } from '@tanstack/react-router';
import { authClient } from './client';

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
        rememberMe: false,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? 'Too many attempts. Try again later.'
            : 'Unable to sign in. Check your email and password.',
        );
        return;
      }
      await router.invalidate();
      await router.navigate({ to: '/' });
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-sm space-y-5" aria-labelledby="login-heading">
      <h1 id="login-heading" className="text-3xl font-semibold tracking-tight">
        Staff login
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          Email
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label className="block space-y-1">
          Password
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          type="submit"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        Contact your administrator for an account.
      </p>
    </section>
  );
}
