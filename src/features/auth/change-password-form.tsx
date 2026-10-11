import { useRef, useState, type SubmitEvent } from 'react';
import { useRouter } from '@tanstack/react-router';
import { changePassword, StaffApiError } from '../staff/api';
import { passwordDetails } from './password-validation';
import { PasswordFields } from './password-fields';

export function ChangePasswordForm({ required }: { required: boolean }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const element = event.currentTarget;
    const result = passwordDetails(new FormData(element));
    if (!result.details) {
      setError(result.error);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await changePassword(result.details);
      element.reset();
      setChanged(true);
      await router.navigate({
        to: '/login',
        search: { passwordChanged: true },
        replace: true,
      });
      await router.invalidate();
    } catch (error) {
      if (error instanceof StaffApiError && error.status === 401) {
        element.reset();
        await router.navigate({ to: '/login', replace: true });
        await router.invalidate();
      } else
        setError(
          error instanceof StaffApiError
            ? error.message
            : 'Unable to change password. Please try again.',
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="max-w-sm space-y-5" aria-labelledby="password-heading">
      <h1
        id="password-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        Change password
      </h1>
      <p className="text-sm text-muted-foreground">
        {required
          ? 'You must replace your temporary password before accessing clinic workflows. '
          : ''}
        Changing your password signs you out on every device. Sign in again with
        your new password.
      </p>
      <form
        aria-label="Change password"
        onSubmit={submit}
        className="space-y-4"
      >
        <fieldset disabled={busy || changed} className="space-y-4">
          <legend className="sr-only">Password details</legend>
          <PasswordFields />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
