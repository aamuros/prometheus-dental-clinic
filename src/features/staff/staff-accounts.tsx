import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { passwordDetails } from '../auth/password-validation';
import { PasswordFields } from '../auth/password-fields';
import {
  manageStaff,
  StaffApiError,
  type StaffAccount,
  type StaffAction,
  type StaffList,
} from './api';

const labels: Record<StaffAction, string> = {
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  'revoke-sessions': 'Revoke sessions',
  'recover-password': 'Recover password',
};
type Selection = { account: StaffAccount; action: StaffAction };
export function StaffAccounts({
  list,
  actorId,
}: {
  list: StaffList;
  actorId: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!selection && lastTrigger.current) {
      if (lastTrigger.current.isConnected) lastTrigger.current.focus();
      else heading.current?.focus();
    }
  }, [selection]);
  function cancel() {
    setSelection(null);
    setError('');
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !selection) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const recovery = selection.action === 'recover-password';
    const result = recovery
      ? passwordDetails(form, true)
      : { details: {}, error: undefined };
    if (!result.details) {
      setError(result.error ?? 'Check the password details.');
      return;
    }
    if (recovery && form.get('identityVerified') !== 'on') {
      setError('Verify the employee’s identity before recovery.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const { account, action } = selection;
    try {
      await manageStaff(account.id, action, result.details);
      element.reset();
      setSelection(null);
      if (
        account.id === actorId &&
        (action === 'deactivate' || action === 'revoke-sessions')
      ) {
        await router.navigate({ to: '/login', replace: true });
        await router.invalidate();
        return;
      }
      setMessage(
        `${labels[action]} completed for ${account.name}.${recovery ? ' Share the temporary password through a trusted private channel. The employee must replace it after login.' : ''}`,
      );
      setRefreshing(true);
      // Refresh is separate from mutation feedback: the committed action must not be reported as failed.
      try {
        await router.invalidate();
      } catch {
        setError(
          'Account updated, but the list could not refresh. Reload the page.',
        );
      }
    } catch (error) {
      if (error instanceof StaffApiError && error.status === 401) {
        element.reset();
        await router.navigate({ to: '/login', replace: true });
        await router.invalidate();
      } else
        setError(
          error instanceof StaffApiError
            ? error.message
            : 'Unable to update account. Please try again.',
        );
    } finally {
      submitting.current = false;
      setBusy(false);
      setRefreshing(false);
    }
  }
  return (
    <section
      className="mt-10 space-y-4 border-t border-border pt-6"
      aria-labelledby="staff-heading"
      aria-busy={busy || refreshing}
    >
      <h2
        ref={heading}
        tabIndex={-1}
        id="staff-heading"
        className="text-xl font-semibold"
      >
        Staff accounts
      </h2>
      <p className="text-sm text-muted-foreground">
        Accounts are retained for clinical history. Deactivation and session
        revocation require a fresh login.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {list.accounts.length === 0 ? (
        <p>No staff accounts on this page.</p>
      ) : (
        <ul className="space-y-4">
          {list.accounts.map((account) => (
            <li
              key={account.id}
              className="space-y-2 rounded-md border border-border p-4"
            >
              <h3 className="font-semibold">{account.name}</h3>
              <p className="break-all text-sm">{account.email}</p>
              <p className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>
                  {account.role === 'admin' ? 'Administrator' : 'Staff'}
                </span>
                <span>{account.active ? 'Active' : 'Inactive'}</span>
                {account.isDentist && <span>Dentist</span>}
                {account.passwordChangeRequired && (
                  <span>Password change required</span>
                )}
                {account.id === actorId && <span>Your account</span>}
              </p>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    account.active ? 'deactivate' : 'reactivate',
                    'revoke-sessions',
                    'recover-password',
                  ] as const
                )
                  .filter(
                    (action) =>
                      action !== 'recover-password' || account.id !== actorId,
                  )
                  .map((action) => {
                    return (
                      <button
                        key={action}
                        type="button"
                        disabled={busy || selection !== null}
                        aria-label={`${labels[action]} for ${account.name}`}
                        className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50"
                        onClick={(event) => {
                          lastTrigger.current = event.currentTarget;
                          setSelection({ account, action });
                          setMessage('');
                          setError('');
                        }}
                      >
                        {labels[action]}
                      </button>
                    );
                  })}
              </div>
              {selection?.account.id === account.id && (
                <form
                  aria-label={`${labels[selection.action]}: ${account.name}`}
                  onSubmit={submit}
                  className="mt-4 max-w-sm space-y-4 border-t border-border pt-4"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && !busy) {
                      event.preventDefault();
                      cancel();
                    }
                  }}
                >
                  <h4 className="font-semibold">
                    Confirm {labels[selection.action]} for {account.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {selection.action === 'deactivate'
                      ? 'This blocks login and signs the employee out on every device. Clinical history is retained.'
                      : selection.action === 'reactivate'
                        ? 'This restores login access. The employee must sign in again; any required password change remains.'
                        : selection.action === 'revoke-sessions'
                          ? 'This signs the employee out on every device, including this device if it is your account.'
                          : 'Verify the employee’s identity using the clinic’s trusted process. Recovery signs them out everywhere and requires a password change after login.'}
                  </p>
                  <fieldset disabled={busy} className="space-y-3">
                    <legend className="sr-only">Confirm account action</legend>
                    {selection.action === 'recover-password' && (
                      <>
                        <PasswordFields recovery />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="identityVerified"
                            required
                          />
                          I verified the employee’s identity.
                        </label>
                      </>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        autoFocus
                        onClick={cancel}
                        className="rounded-md border border-input px-4 py-2 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                      >
                        {busy
                          ? 'Saving…'
                          : `Confirm ${labels[selection.action]}`}
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label="Staff account pages"
        className="flex flex-wrap items-center gap-4 text-sm"
      >
        {list.page > 1 && (
          <Link
            to="/staff"
            search={{ page: list.page - 1 }}
            className="underline"
            disabled={busy || selection !== null}
          >
            Previous page
          </Link>
        )}
        <span>Page {list.page}</span>
        {list.hasMore && (
          <Link
            to="/staff"
            search={{ page: list.page + 1 }}
            className="underline"
            disabled={busy || selection !== null}
          >
            Next page
          </Link>
        )}
      </nav>
    </section>
  );
}
