import { useState, type SubmitEvent } from 'react';
import { useRouter } from '@tanstack/react-router';

export function CreateAccountForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          role: form.get('role'),
          data: { isDentist: form.get('isDentist') === 'on' },
        }),
      });
      if (response.status === 401) {
        await router.navigate({ to: '/login' });
        return;
      }
      if (!response.ok) {
        setError(
          'Unable to create account. Check the details and your administrator access.',
        );
        return;
      }
      element.reset();
      setMessage(
        'Account created. Share the password securely with the staff member.',
      );
      await router.invalidate();
    } catch {
      setError('Unable to create account. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-sm space-y-5" aria-labelledby="account-heading">
      <h1
        id="account-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        Create staff account
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          Name
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
          />
        </label>
        <label className="block space-y-1">
          Email
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="email"
            type="email"
            autoComplete="off"
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
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label className="block space-y-1">
          Role
          <select
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="role"
            defaultValue="staff"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDentist" />
          Assigned dentist (available for appointments)
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          type="submit"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </section>
  );
}
