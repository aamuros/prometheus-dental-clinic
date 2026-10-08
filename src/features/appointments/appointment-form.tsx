import { useState, type SubmitEvent } from 'react';
import { isRedirect, Link, useRouter } from '@tanstack/react-router';
import {
  appointmentStatuses,
  clinicDate,
  clinicDateTime,
  clinicInputToUtc,
} from '../../../shared/appointments';
import type { Appointment, Dentist } from '../../../shared/appointments';
import type { PatientList } from '../../../shared/patients';
import { loadPatients, PatientApiError } from '../patients/api';
import { AppointmentApiError, saveAppointment } from './api';

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2';

function formInstant(value: string, original?: string) {
  const utc = clinicInputToUtc(value);
  // Keep fractional seconds when editing an otherwise unchanged time.
  return original && utc.slice(0, 19) === original.slice(0, 19)
    ? original
    : utc;
}

export function AppointmentForm({
  appointment,
  patients: initialPatients,
  dentists,
}: {
  appointment?: Appointment;
  patients: PatientList;
  dentists: Dentist[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [query, setQuery] = useState('');
  const [patientList, setPatientList] = useState(initialPatients);
  const [selected, setSelected] = useState<
    { id: string; name: string } | undefined
  >(
    appointment
      ? { id: appointment.patientId, name: appointment.patientName }
      : undefined,
  );

  async function searchPatients(page = 1) {
    setSearchBusy(true);
    setSearchError('');
    try {
      const data = await loadPatients(
        { q: query, page, status: 'active' },
        new AbortController().signal,
      );
      setPatientList(data);
    } catch (error) {
      if (
        isRedirect(error) ||
        (error instanceof PatientApiError && error.status === 401)
      )
        await router.navigate({ to: '/login' });
      else setSearchError('Unable to search patients. Please try again.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = appointmentStatuses.find(
      (value) => value === form.get('status'),
    );
    if (!status || !selected) {
      setError('Choose a patient and status.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveAppointment(
        {
          patientId: selected.id,
          dentistId: String(form.get('dentistId')),
          startAt: formInstant(
            String(form.get('startAt')),
            appointment?.startAt,
          ),
          endAt: formInstant(String(form.get('endAt')), appointment?.endAt),
          status,
          notes: String(form.get('notes')).trim() || null,
        },
        appointment?.id,
      );
      await router.invalidate();
      await router.navigate({
        to: '/appointments',
        search: {
          date: clinicDate(new Date(saved.startAt)),
          view: 'day',
          page: 1,
        },
      });
    } catch (error) {
      if (error instanceof AppointmentApiError && error.status === 401) {
        await router.navigate({ to: '/login' });
        return;
      }
      setError(
        error instanceof AppointmentApiError &&
          [400, 409].includes(error.status)
          ? error.message
          : 'Unable to save appointment. Check the times and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="max-w-md space-y-5"
      aria-labelledby="appointment-form-heading"
    >
      <h1
        id="appointment-form-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        {appointment ? 'Edit or reschedule appointment' : 'Create appointment'}
      </h1>
      <p className="text-sm text-muted-foreground">
        All times are in Asia/Manila (UTC+08:00).
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void searchPatients();
        }}
        className="space-y-2"
      >
        <label className="block text-sm">
          Search active patients
          <input
            className={inputClass}
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex gap-4 text-sm">
          <button
            type="submit"
            disabled={searchBusy || busy}
            className="underline"
          >
            Search patients
          </button>
          {patientList.page > 1 && (
            <button
              type="button"
              disabled={searchBusy || busy}
              onClick={() => void searchPatients(patientList.page - 1)}
              className="underline"
            >
              Previous patients
            </button>
          )}
          {patientList.hasMore && (
            <button
              type="button"
              disabled={searchBusy || busy}
              onClick={() => void searchPatients(patientList.page + 1)}
              className="underline"
            >
              More patients
            </button>
          )}
        </div>
        {searchError && <p role="alert">{searchError}</p>}
      </form>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-1">
            Patient
            <select
              className={inputClass}
              required
              value={selected?.id ?? ''}
              onChange={(event) =>
                setSelected(
                  patientList.patients.find(
                    (patient) => patient.id === event.target.value,
                  ) ??
                    (selected?.id === event.target.value
                      ? selected
                      : undefined),
                )
              }
            >
              <option value="">Choose patient</option>
              {selected &&
                !patientList.patients.some(
                  (patient) => patient.id === selected.id,
                ) && <option value={selected.id}>{selected.name}</option>}
              {patientList.patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} — {patient.contactNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            Assigned dentist
            <select
              className={inputClass}
              name="dentistId"
              required
              defaultValue={appointment?.dentistId ?? ''}
            >
              <option value="">Choose dentist</option>
              {appointment &&
                !dentists.some(
                  (dentist) => dentist.id === appointment.dentistId,
                ) && (
                  <option value={appointment.dentistId}>
                    {appointment.dentistName} (unavailable for rescheduling)
                  </option>
                )}
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.name}
                </option>
              ))}
            </select>
          </label>
          {!dentists.length && (
            <p role="status" className="text-sm text-muted-foreground">
              An administrator must create a staff account designated as a
              dentist before booking.
            </p>
          )}
          <label className="block space-y-1">
            Start time
            <input
              className={inputClass}
              name="startAt"
              type="datetime-local"
              step="1"
              required
              defaultValue={
                appointment ? clinicDateTime(appointment.startAt, true) : ''
              }
            />
          </label>
          <label className="block space-y-1">
            End time
            <input
              className={inputClass}
              name="endAt"
              type="datetime-local"
              step="1"
              required
              defaultValue={
                appointment ? clinicDateTime(appointment.endAt, true) : ''
              }
            />
          </label>
          <label className="block space-y-1">
            Status
            <select
              className={inputClass}
              name="status"
              defaultValue={appointment?.status ?? 'scheduled'}
            >
              {appointmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            Notes (optional)
            <textarea
              className={inputClass}
              name="notes"
              maxLength={2000}
              rows={3}
              defaultValue={appointment?.notes ?? ''}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={busy || (!appointment && !dentists.length)}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save appointment'}
          </button>
          <Link
            to="/appointments"
            search={{ date: clinicDate(), view: 'list', page: 1 }}
            className="text-sm underline"
          >
            Back to appointments
          </Link>
        </div>
      </form>
    </section>
  );
}
