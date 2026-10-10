import { useState, type SubmitEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import type { Patient } from '../../../shared/patients';
import { clinicDate } from '../../../shared/appointments';
import { PatientApiError, savePatient } from './api';

export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const saved = await savePatient(
        {
          name: String(data.get('name')),
          birthDate: String(data.get('birthDate')),
          contactNumber: String(data.get('contactNumber')),
          email: String(data.get('email')).trim() || null,
        },
        patient?.id,
      );
      await router.invalidate();
      await router.navigate({
        to: '/patients/$patientId',
        params: { patientId: saved.id },
      });
    } catch (error) {
      if (error instanceof PatientApiError && error.status === 401) {
        await router.navigate({ to: '/login' });
        return;
      }
      setError(
        error instanceof PatientApiError && error.status === 409
          ? 'This patient has been archived and cannot be edited.'
          : error instanceof PatientApiError && error.status === 400
            ? 'Check the patient details. Use a valid birth date and a contact number with 7–15 digits.'
            : 'Unable to save patient. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="max-w-sm space-y-5"
      aria-labelledby="patient-form-heading"
    >
      <h1
        id="patient-form-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        {patient ? 'Edit patient' : 'Add patient'}
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          Name
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="name"
            autoComplete="off"
            required
            maxLength={200}
            defaultValue={patient?.name ?? ''}
          />
        </label>
        <label className="block space-y-1">
          Birth date
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="birthDate"
            type="date"
            required
            min="0001-01-01"
            max={clinicDate()}
            defaultValue={patient?.birthDate ?? ''}
          />
        </label>
        <label className="block space-y-1">
          Contact number
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="contactNumber"
            type="tel"
            autoComplete="off"
            required
            maxLength={30}
            defaultValue={patient?.contactNumber ?? ''}
          />
        </label>
        <label className="block space-y-1">
          Email (optional)
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            name="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            defaultValue={patient?.email ?? ''}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            disabled={busy}
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save patient'}
          </button>
          <Link
            to="/patients"
            search={{ q: '', page: 1, status: 'active' }}
            className="text-sm underline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
