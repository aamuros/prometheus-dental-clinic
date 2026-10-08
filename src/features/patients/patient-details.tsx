import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { Route } from '../../routes/patient-details';
import { archivePatient, PatientApiError } from './api';

export function PatientDetailsPage() {
  const patient = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function archive() {
    setBusy(true);
    setError('');
    try {
      await archivePatient(patient.id);
      await router.invalidate();
      setConfirming(false);
    } catch (error) {
      if (error instanceof PatientApiError && error.status === 401) {
        await router.navigate({ to: '/login' });
        return;
      }
      setError(
        error instanceof PatientApiError && error.status === 403
          ? 'Administrator access is required to archive patients.'
          : 'Unable to archive patient. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-xl space-y-6" aria-labelledby="patient-heading">
      <Link
        to="/patients"
        search={{
          q: '',
          page: 1,
          status: patient.archivedAt ? 'archived' : 'active',
        }}
        className="text-sm underline"
      >
        Back to patients
      </Link>
      <h1
        id="patient-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        {patient.name}
      </h1>
      {patient.archivedAt && (
        <p role="status" className="text-muted-foreground">
          Archived patient
        </p>
      )}
      <dl className="space-y-4">
        <div>
          <dt className="text-sm text-muted-foreground">Birth date</dt>
          <dd>{patient.birthDate}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Contact number</dt>
          <dd>{patient.contactNumber}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd>{patient.email ?? 'Not provided'}</dd>
        </div>
      </dl>
      <Link
        to="/patients/$patientId/dental-records"
        params={{ patientId: patient.id }}
        search={{ kind: 'note', page: 1 }}
        className="block text-sm underline"
      >
        Dental records and treatment history
      </Link>
      {!patient.archivedAt && (
        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/patients/$patientId/edit"
            params={{ patientId: patient.id }}
            className="underline"
          >
            Edit patient
          </Link>
          {session.user.role === 'admin' && (
            <button
              type="button"
              className="underline"
              onClick={() => setConfirming(true)}
            >
              Archive patient
            </button>
          )}
        </div>
      )}
      {confirming && !patient.archivedAt && (
        <div className="space-y-3 border-t border-border pt-4">
          <p>
            Archive this patient? The record will remain available in the
            archived list and cannot be edited.
          </p>
          <div className="flex gap-4 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={archive}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Archiving…' : 'Confirm archive'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="underline"
            >
              Cancel archive
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
