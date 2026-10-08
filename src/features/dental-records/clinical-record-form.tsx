import { useState, type SubmitEvent } from 'react';
import { clinicDate, clinicDateTime } from '../../../shared/appointments';
import type {
  DentalRecord,
  DentalRecordKind,
} from '../../../shared/dental-records';
import { isFdiTooth } from '../../../shared/dental-records';
import {
  DentalRecordApiError,
  saveDentalRecord,
  type RecordOptions,
} from './api';

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2';
export function ClinicalRecordForm({
  patientId,
  kind,
  record,
  options,
  actorId,
  onSaved,
  onCancel,
  onAccessError,
}: {
  patientId: string;
  kind: DentalRecordKind;
  record: DentalRecord | undefined;
  options: RecordOptions;
  actorId: string;
  onSaved: (record: DentalRecord) => Promise<void>;
  onCancel: () => void;
  onAccessError: (status: number) => Promise<void>;
}) {
  const [dentistId, setDentistId] = useState(
    record?.dentistId ??
      (options.dentists.some((dentist) => dentist.id === actorId)
        ? actorId
        : ''),
  );
  const [appointmentId, setAppointmentId] = useState(
    record?.appointmentId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawTeeth = String(data.get('toothNumbers')).trim();
    const toothNumbers = rawTeeth ? rawTeeth.split(/[\s,]+/).map(Number) : [];
    if (
      toothNumbers.some((tooth) => !isFdiTooth(tooth)) ||
      new Set(toothNumbers).size !== toothNumbers.length
    ) {
      setError('Use distinct FDI tooth numbers, such as 11, 26, or 51.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveDentalRecord(
        {
          patientId,
          kind,
          dentistId,
          appointmentId: appointmentId || null,
          treatmentDate: String(data.get('treatmentDate')),
          clinicalNotes: String(data.get('clinicalNotes')).trim() || null,
          diagnosis: String(data.get('diagnosis')).trim() || null,
          procedures: String(data.get('procedures')).trim() || null,
          toothNumbers,
        },
        record,
      );
      await onSaved(saved);
    } catch (error) {
      if (
        error instanceof DentalRecordApiError &&
        [401, 403].includes(error.status)
      ) {
        await onAccessError(error.status);
        return;
      }
      setError(
        error instanceof DentalRecordApiError
          ? error.message
          : 'Unable to save clinical record. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="max-w-xl space-y-4 border-t border-border pt-5"
      aria-labelledby="clinical-form-heading"
    >
      <h2 id="clinical-form-heading" className="text-xl font-semibold">
        {record
          ? 'Edit clinical record'
          : kind === 'note'
            ? 'Add clinical note'
            : 'Record completed treatment'}
      </h2>
      <p className="text-sm text-muted-foreground">
        Every save preserves a dated revision and its author.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-1">
            {kind === 'note' ? 'Record date' : 'Treatment date'}
            <input
              className={inputClass}
              type="date"
              name="treatmentDate"
              required
              max={clinicDate()}
              defaultValue={record?.treatmentDate ?? clinicDate()}
            />
          </label>
          <label className="block space-y-1">
            Responsible dentist
            <select
              className={inputClass}
              name="dentistId"
              required
              value={dentistId}
              onChange={(event) => {
                setDentistId(event.target.value);
                setAppointmentId('');
              }}
            >
              <option value="">Choose dentist</option>
              {record &&
                !options.dentists.some(
                  (dentist) => dentist.id === record.dentistId,
                ) && (
                  <option value={record.dentistId}>
                    {record.dentistName} (previous dentist)
                  </option>
                )}
              {options.dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            Recent appointment (optional)
            <select
              className={inputClass}
              name="appointmentId"
              value={appointmentId}
              onChange={(event) => setAppointmentId(event.target.value)}
            >
              <option value="">No linked appointment</option>
              {record?.appointmentId &&
                record.dentistId === dentistId &&
                !options.appointments.some(
                  (appointment) => appointment.id === record.appointmentId,
                ) && (
                  <option value={record.appointmentId}>
                    Previously linked appointment
                  </option>
                )}
              {options.appointments
                .filter((appointment) => appointment.dentistId === dentistId)
                .map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {clinicDateTime(appointment.startAt).replace('T', ' ')} —{' '}
                    {appointment.dentistName} ({appointment.status})
                  </option>
                ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            The 50 most recent eligible appointments are shown in Asia/Manila
            time.
          </p>
          <label className="block space-y-1">
            Clinical notes{kind === 'treatment' ? ' (optional)' : ''}
            <textarea
              className={inputClass}
              name="clinicalNotes"
              rows={4}
              maxLength={4000}
              required={kind === 'note'}
              defaultValue={record?.clinicalNotes ?? ''}
            />
          </label>
          <label className="block space-y-1">
            Diagnosis (optional)
            <textarea
              className={inputClass}
              name="diagnosis"
              rows={2}
              maxLength={2000}
              defaultValue={record?.diagnosis ?? ''}
            />
          </label>
          <label className="block space-y-1">
            Procedures performed{kind === 'note' ? ' (optional)' : ''}
            <textarea
              className={inputClass}
              name="procedures"
              rows={2}
              maxLength={2000}
              required={kind === 'treatment'}
              defaultValue={record?.procedures ?? ''}
            />
          </label>
          <label className="block space-y-1">
            Tooth numbers (FDI, optional)
            <input
              className={inputClass}
              name="toothNumbers"
              autoComplete="off"
              defaultValue={record?.toothNumbers.join(', ') ?? ''}
              aria-describedby="tooth-help"
            />
          </label>
          <p id="tooth-help" className="text-xs text-muted-foreground">
            Separate numbers with commas. Permanent teeth: 11–48; primary teeth:
            51–85, using valid FDI positions.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-4 text-sm">
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Saving…' : record ? 'Save revision' : 'Save record'}
          </button>
          <button
            className="underline"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
