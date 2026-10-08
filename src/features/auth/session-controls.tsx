import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import type { StaffSession } from '../../../shared/auth';
import { authClient } from './client';
import { clinicDate } from '../../../shared/appointments';

export function SessionControls({ session }: { session: StaffSession }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Logout failed');
      // Clear the authenticated route tree and reload session guards.
      await router.navigate({ to: '/login' });
      await router.invalidate();
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-8 space-y-2 text-sm">
      <nav
        aria-label="Staff account"
        className="flex flex-wrap items-center gap-4"
      >
        <span>{session.user.name}</span>
        <Link
          to="/patients"
          search={{ q: '', page: 1, status: 'active' }}
          className="underline"
        >
          Patients
        </Link>
        <Link
          to="/appointments"
          search={{ date: clinicDate(), view: 'list', page: 1 }}
          className="underline"
        >
          Appointments
        </Link>
        {session.user.role === 'admin' && (
          <Link to="/staff" className="underline">
            Create staff account
          </Link>
        )}
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="underline disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </nav>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
