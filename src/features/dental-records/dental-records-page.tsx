import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import type {
  DentalRecord,
  DentalRecordDetails,
  DentalRecordInput,
  DentalRecordKind,
  DentalRecordList,
} from '../../../shared/dental-records';
import type { Patient } from '../../../shared/patients';
import { clinicDateTime } from '../../../shared/appointments';
import { Route } from '../../routes/dental-records';
import { ClinicalRecordForm } from './clinical-record-form';
import {
  DentalRecordApiError,
  loadRecordDetails,
  loadRecordOptions,
  type RecordOptions,
} from './api';

function ClinicalContent({
  record,
  dentistName,
}: {
  record: DentalRecordInput;
  dentistName: string;
}) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground">Responsible dentist</dt>
        <dd>{dentistName}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{record.treatmentDate}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Clinical notes</dt>
        <dd className="whitespace-pre-wrap break-words">
          {record.clinicalNotes ?? 'None'}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Diagnosis</dt>
        <dd className="whitespace-pre-wrap break-words">
          {record.diagnosis ?? 'None'}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Procedures performed</dt>
        <dd className="whitespace-pre-wrap break-words">
          {record.procedures ?? 'None'}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Teeth (FDI)</dt>
        <dd>{record.toothNumbers.join(', ') || 'Not specified'}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Appointment</dt>
        <dd>
          {record.appointmentId
            ? 'Linked appointment'
            : 'No linked appointment'}
        </dd>
      </div>
    </dl>
  );
}
export function DentalRecordsPage() {
  const { patient, records } = Route.useLoaderData();
  const { kind } = Route.useSearch();
  const { session } = Route.useRouteContext();
  return (
    <DentalRecordsView
      key={patient.id}
      patient={patient}
      records={records}
      kind={kind}
      actorId={session.user.id}
    />
  );
}
function DentalRecordsView({
  patient,
  records,
  kind,
  actorId,
}: {
  patient: Patient;
  records: DentalRecordList | null;
  kind: DentalRecordKind;
  actorId: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{
    kind: DentalRecordKind;
    record: DentalRecord | undefined;
    options: RecordOptions;
  } | null>(null);
  const [details, setDetails] = useState<DentalRecordDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accessError(status: number) {
    setEditor(null);
    setDetails(null);
    if (status === 401) await router.navigate({ to: '/login' });
    else await router.invalidate();
  }
  async function operation(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (error) {
      if (
        error instanceof DentalRecordApiError &&
        [401, 403].includes(error.status)
      )
        await accessError(error.status);
      else
        setError(
          error instanceof DentalRecordApiError
            ? error.message
            : 'Unable to load clinical record. Please try again.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function view(id: string, page = 1) {
    await operation(async () => {
      setEditor(null);
      setDetails(await loadRecordDetails(id, page));
    });
  }
  async function edit(editKind: DentalRecordKind, record?: DentalRecord) {
    await operation(async () => {
      const options = await loadRecordOptions(patient.id);
      setDetails(null);
      setEditor({ kind: editKind, record, options });
    });
  }
  async function saved(record: DentalRecord) {
    setEditor(null);
    await operation(async () => {
      await router.navigate({
        to: '/patients/$patientId/dental-records',
        params: { patientId: patient.id },
        search: { kind: record.kind, page: 1 },
      });
      await router.invalidate();
      setDetails(await loadRecordDetails(record.id));
    });
  }
  return (
    <section className="max-w-3xl space-y-6" aria-labelledby="dental-heading">
      <Link
        to="/patients/$patientId"
        params={{ patientId: patient.id }}
        className="text-sm underline"
      >
        Back to patient
      </Link>
      <div>
        <h1
          id="dental-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          Dental records
        </h1>
        <p className="mt-2 text-muted-foreground">
          {patient.name}
          {patient.archivedAt ? ' — Archived patient' : ''}
        </p>
      </div>
      {!records ? (
        <p role="alert">
          Clinical dentist access is required to view dental records and
          treatment history.
        </p>
      ) : (
        <>
          <nav
            aria-label="Clinical records"
            className="flex flex-wrap gap-4 text-sm"
          >
            <Link
              to="/patients/$patientId/dental-records"
              params={{ patientId: patient.id }}
              search={{ kind: 'note', page: 1 }}
              onClick={() => {
                setEditor(null);
                setDetails(null);
              }}
              className="underline"
              aria-current={kind === 'note' ? 'page' : undefined}
            >
              Patient dental records
            </Link>
            <Link
              to="/patients/$patientId/dental-records"
              params={{ patientId: patient.id }}
              search={{ kind: 'treatment', page: 1 }}
              onClick={() => {
                setEditor(null);
                setDetails(null);
              }}
              className="underline"
              aria-current={kind === 'treatment' ? 'page' : undefined}
            >
              Treatment history
            </Link>
          </nav>
          {!patient.archivedAt && (
            <div className="flex flex-wrap gap-4 text-sm">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                disabled={busy || !!editor}
                onClick={() => void edit('note')}
              >
                Add clinical note
              </button>
              <button
                type="button"
                className="rounded-md border border-input px-4 py-2 disabled:opacity-50"
                disabled={busy || !!editor}
                onClick={() => void edit('treatment')}
              >
                Record completed treatment
              </button>
            </div>
          )}
          <h2 className="text-xl font-semibold">
            {kind === 'note' ? 'Clinical notes' : 'Treatment history'}
          </h2>
          {!records.records.length ? (
            <p className="text-sm text-muted-foreground">
              {kind === 'note'
                ? 'No clinical notes yet.'
                : 'No completed treatments yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {records.records.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {record.treatmentDate} — {record.dentistName}
                    </p>
                    <p className="max-w-xl truncate text-sm text-muted-foreground">
                      {record.kind === 'note'
                        ? record.clinicalNotes
                        : record.procedures}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm underline"
                    disabled={busy || !!editor}
                    onClick={() => void view(record.id)}
                    aria-label={`View record details for ${record.treatmentDate}, ${record.dentistName}`}
                  >
                    View record details
                  </button>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Record pages" className="flex gap-4 text-sm">
            <span>Page {records.page}</span>
            {records.page > 1 && (
              <Link
                to="/patients/$patientId/dental-records"
                params={{ patientId: patient.id }}
                search={{ kind, page: records.page - 1 }}
                className="underline"
              >
                Previous records
              </Link>
            )}
            {records.hasMore && (
              <Link
                to="/patients/$patientId/dental-records"
                params={{ patientId: patient.id }}
                search={{ kind, page: records.page + 1 }}
                className="underline"
              >
                Next records
              </Link>
            )}
          </nav>
          {busy && (
            <p role="status" className="text-sm">
              Loading clinical record…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {editor && (
            <ClinicalRecordForm
              patientId={patient.id}
              kind={editor.kind}
              record={editor.record}
              options={editor.options}
              actorId={actorId}
              onSaved={saved}
              onCancel={() => setEditor(null)}
              onAccessError={accessError}
            />
          )}
          {details && (
            <section
              className="space-y-4 border-t border-border pt-5"
              aria-labelledby="record-details-heading"
            >
              <h2 id="record-details-heading" className="text-xl font-semibold">
                Record details
              </h2>
              <p className="text-sm">
                {details.record.kind === 'note'
                  ? 'Clinical note'
                  : 'Completed treatment'}{' '}
                — {details.record.dentistName} — Version{' '}
                {details.record.version}
              </p>
              <ClinicalContent
                record={details.record}
                dentistName={details.record.dentistName}
              />
              <p className="text-xs text-muted-foreground">
                Created{' '}
                {clinicDateTime(details.record.createdAt).replace('T', ' ')} ·
                Updated{' '}
                {clinicDateTime(details.record.updatedAt).replace('T', ' ')}{' '}
                (Asia/Manila)
              </p>
              <div className="flex gap-4 text-sm">
                <button
                  className="underline"
                  type="button"
                  disabled={busy}
                  onClick={() => void edit(details.record.kind, details.record)}
                >
                  Edit clinical record
                </button>
                <button
                  className="underline"
                  type="button"
                  onClick={() => setDetails(null)}
                >
                  Close details
                </button>
              </div>
              <h3 className="font-semibold">Change history</h3>
              <ol className="space-y-3">
                {details.history.map((change) => (
                  <li key={change.version}>
                    <details className="space-y-3">
                      <summary className="cursor-pointer text-sm">
                        Version {change.version} · {change.changedByName} ·{' '}
                        {clinicDateTime(change.changedAt).replace('T', ' ')}{' '}
                        (Asia/Manila)
                      </summary>
                      <ClinicalContent
                        record={change.snapshot}
                        dentistName={change.dentistName}
                      />
                    </details>
                  </li>
                ))}
              </ol>
              <nav aria-label="History pages" className="flex gap-4 text-sm">
                <span>History page {details.page}</span>
                {details.page > 1 && (
                  <button
                    type="button"
                    className="underline"
                    disabled={busy}
                    onClick={() =>
                      void view(details.record.id, details.page - 1)
                    }
                  >
                    Previous revisions
                  </button>
                )}
                {details.hasMore && (
                  <button
                    type="button"
                    className="underline"
                    disabled={busy}
                    onClick={() =>
                      void view(details.record.id, details.page + 1)
                    }
                  >
                    Next revisions
                  </button>
                )}
              </nav>
            </section>
          )}
        </>
      )}
    </section>
  );
}
