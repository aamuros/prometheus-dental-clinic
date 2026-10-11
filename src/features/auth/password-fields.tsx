import { useId } from 'react';

export function PasswordFields({ recovery = false }: { recovery?: boolean }) {
  const helpId = useId();
  return (
    <>
      <label className="block space-y-1">
        {recovery ? 'Your administrator password' : 'Current password'}
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="block w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
      <label className="block space-y-1">
        {recovery ? 'Temporary password' : 'New password'}
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          aria-describedby={helpId}
          className="block w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
      <p id={helpId} className="text-sm text-muted-foreground">
        Use 12–128 characters
        {recovery
          ? '.'
          : ' and a password different from your current password.'}
      </p>
      <label className="block space-y-1">
        {recovery ? 'Confirm temporary password' : 'Confirm new password'}
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          className="block w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
    </>
  );
}
