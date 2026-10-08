import { useState, type SubmitEvent } from 'react';
import { useRouter } from '@tanstack/react-router';
import type { SchedulingStaff } from '../../../shared/appointments';
import { AppointmentApiError, designateDentist } from './api';

export function DentistSettings({ staff }: { staff: SchedulingStaff[] }) {
  const router = useRouter();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selected = staff.find((member) => member.id === id);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await designateDentist(selected.id, !selected.isDentist);
      await router.invalidate();
      setMessage(
        'Dentist designation updated. Existing appointments are retained.',
      );
    } catch (error) {
      if (error instanceof AppointmentApiError && error.status === 401)
        await router.navigate({ to: '/login' });
      else setError('Unable to update dentist designation. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-10 max-w-sm space-y-4 border-t border-border pt-6"
      aria-labelledby="dentists-heading"
    >
      <h2 id="dentists-heading" className="text-xl font-semibold">
        Dentists for scheduling
      </h2>
      <p className="text-sm text-muted-foreground">
        Choose an existing staff account to enable or remove it from appointment
        booking.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          Existing staff
          <select
            required
            disabled={busy}
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              setMessage('');
              setError('');
            }}
          >
            <option value="">Choose staff account</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.isDentist ? ' (dentist)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !selected}
          type="submit"
          className="rounded-md border border-input px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy
            ? 'Saving…'
            : selected?.isDentist
              ? 'Remove dentist designation'
              : 'Designate as dentist'}
        </button>
      </form>
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
    </section>
  );
}
