import { useState, type SubmitEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  addClinicDays,
  clinicDateTime,
  clinicDayStart,
  clinicWeekStart,
} from '../../../shared/appointments';
import type { Appointment } from '../../../shared/appointments';
import { Route } from '../../routes/appointments';
import { AppointmentApiError, cancelAppointment } from './api';

export function AppointmentListPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function filter(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void navigate({
      search: { ...search, date: String(form.get('date')), page: 1 },
    });
  }
  async function cancel(id: string) {
    setBusy(true);
    setError('');
    try {
      await cancelAppointment(id);
      setConfirmId(null);
      await router.invalidate();
    } catch (error) {
      if (error instanceof AppointmentApiError && error.status === 401)
        await router.navigate({ to: '/login' });
      else setError('Unable to cancel appointment. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  function table(rows: Appointment[], caption: string) {
    return rows.length ? (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {[
                'Time (Asia/Manila)',
                'Patient',
                'Dentist',
                'Status',
                'Actions',
              ].map((title) => (
                <th key={title} scope="col" className="py-3 pr-4">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((appointment) => (
              <tr key={appointment.id} className="border-b border-border">
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={appointment.startAt}>
                    {clinicDateTime(appointment.startAt).replace('T', ' ')}
                  </time>
                  <br />
                  to{' '}
                  <time dateTime={appointment.endAt}>
                    {clinicDateTime(appointment.endAt).replace('T', ' ')}
                  </time>
                </td>
                <td className="py-3 pr-4">
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: appointment.patientId }}
                    className="underline"
                  >
                    {appointment.patientName}
                  </Link>
                </td>
                <td className="py-3 pr-4">{appointment.dentistName}</td>
                <td className="py-3 pr-4">{appointment.status}</td>
                <td className="space-y-2 py-3">
                  <Link
                    to="/appointments/$appointmentId/edit"
                    params={{ appointmentId: appointment.id }}
                    className="block underline"
                  >
                    Edit or reschedule
                  </Link>
                  {appointment.status !== 'cancelled' &&
                    (confirmId === appointment.id ? (
                      <div className="space-y-2">
                        <p>Cancel this appointment?</p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void cancel(appointment.id)}
                          className="mr-3 underline"
                        >
                          Confirm cancellation
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmId(null)}
                          className="underline"
                        >
                          Keep appointment
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(appointment.id)}
                        className="underline"
                      >
                        Cancel appointment
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No appointments.</p>
    );
  }
  const firstDay =
    search.view === 'week' ? clinicWeekStart(search.date) : search.date;
  const days = Array.from(
    { length: search.view === 'week' ? 7 : 1 },
    (_, index) => addClinicDays(firstDay, index),
  );
  return (
    <section className="space-y-6" aria-labelledby="appointments-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          id="appointments-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          Appointments
        </h1>
        <Link
          to="/appointments/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Create appointment
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Schedule times are in Asia/Manila (UTC+08:00).
      </p>
      <nav aria-label="Schedule views" className="flex gap-4 text-sm">
        {(['list', 'day', 'week'] as const).map((view) => (
          <Link
            key={view}
            to="/appointments"
            search={{ ...search, view, page: 1 }}
            aria-current={search.view === view ? 'page' : undefined}
            className="underline"
          >
            {view === 'list' ? 'List' : view === 'day' ? 'Daily' : 'Weekly'}
          </Link>
        ))}
      </nav>
      <form
        key={search.date}
        onSubmit={filter}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="space-y-1 text-sm">
          Date
          <input
            className="block rounded-md border border-input bg-background px-3 py-2"
            type="date"
            name="date"
            min="0001-01-01"
            max="9999-12-24"
            required
            defaultValue={search.date}
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-input px-4 py-2 text-sm"
        >
          Show schedule
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {search.view === 'list'
        ? table(data.appointments, `Appointments on ${search.date}`)
        : days.map((day) => (
            <section
              key={day}
              aria-label={`Schedule for ${day}`}
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold">{day}</h2>
              {table(
                data.appointments.filter(
                  (appointment) =>
                    appointment.startAt <
                      clinicDayStart(addClinicDays(day, 1)) &&
                    appointment.endAt > clinicDayStart(day),
                ),
                `Appointments on ${day}`,
              )}
            </section>
          ))}
      <nav aria-label="Appointment pages" className="flex gap-4 text-sm">
        {search.page > 1 && (
          <Link
            to="/appointments"
            search={{ ...search, page: search.page - 1 }}
            className="underline"
          >
            Previous page
          </Link>
        )}
        <span>Page {data.page}</span>
        {data.hasMore && (
          <Link
            to="/appointments"
            search={{ ...search, page: search.page + 1 }}
            className="underline"
          >
            Next page
          </Link>
        )}
      </nav>
      {data.hasMore && (
        <p className="text-sm text-muted-foreground">
          More appointments in this date range are on the next page.
        </p>
      )}
    </section>
  );
}
