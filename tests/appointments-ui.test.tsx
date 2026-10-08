// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../src/app/router';
import type { Appointment, AppointmentInput } from '../shared/appointments';

const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
const patient = {
  id,
  name: 'Synthetic patient',
  birthDate: '1990-05-17',
  contactNumber: '09170000000',
  email: null,
  createdAt: '2026-10-08T00:00:00Z',
  updatedAt: '2026-10-08T00:00:00Z',
  archivedAt: null,
};
const appointment: Appointment = {
  id,
  patientId: id,
  dentistId: 'dentist-id',
  patientName: patient.name,
  dentistName: 'Synthetic dentist',
  startAt: '2026-10-12T01:00:00.000Z',
  endAt: '2026-10-12T02:00:00.000Z',
  status: 'scheduled',
  notes: 'Synthetic note',
  createdAt: '2026-10-08T00:00:00Z',
  updatedAt: '2026-10-08T00:00:00Z',
};
let record: Appointment;
let saveStatus: number;
let role: string;
function renderPage(path: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return render(<RouterProvider router={router} />);
}
beforeEach(() => {
  record = { ...appointment };
  saveStatus = 200;
  role = 'staff';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session')
        return Response.json({
          user: {
            id: 'staff',
            name: 'Synthetic staff',
            email: 'staff@example.test',
            role,
          },
        });
      if (path.startsWith('/api/patients?'))
        return Response.json({ patients: [patient], page: 1, hasMore: false });
      if (path === '/api/appointments/dentists')
        return Response.json({
          dentists: [{ id: 'dentist-id', name: appointment.dentistName }],
        });
      if (path === '/api/appointments/staff')
        return Response.json({
          staff: [{ id: 'staff', name: 'Existing staff', isDentist: false }],
        });
      if (
        path.startsWith('/api/appointments/dentists/') &&
        init?.method === 'PUT'
      )
        return Response.json({
          staff: { id: 'staff', name: 'Existing staff', isDentist: true },
        });
      if (path.startsWith('/api/appointments?'))
        return Response.json({
          appointments: [record],
          page: 1,
          hasMore: false,
        });
      if (path.endsWith('/cancel')) {
        record = { ...record, status: 'cancelled' };
        return Response.json({ appointment: record });
      }
      if (init?.method === 'POST' || init?.method === 'PUT') {
        if (saveStatus !== 200)
          return Response.json(
            {
              error:
                saveStatus === 409
                  ? 'This dentist already has an appointment during that time.'
                  : 'Invalid appointment details',
            },
            { status: saveStatus },
          );
        const input = JSON.parse(String(init.body)) as AppointmentInput;
        record = { ...record, ...input };
      }
      return Response.json({ appointment: record });
    }),
  );
});
describe('Appointment UI', () => {
  it('lists Manila times and filters appointments by date', async () => {
    renderPage('/appointments?date=2026-10-12&view=list&page=1');
    expect(await screen.findByText('2026-10-12 09:00')).toBeVisible();
    expect(screen.getByText('2026-10-12 10:00')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-10-13' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show schedule' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/appointments?from=2026-10-13&to=2026-10-14&page=1',
        expect.anything(),
      ),
    );
  });
  it('shows daily/weekly schedules and includes crossing-midnight appointments on both days', async () => {
    record = {
      ...record,
      startAt: '2026-10-12T15:30:00.000Z',
      endAt: '2026-10-12T16:30:00.000Z',
    };
    renderPage('/appointments?date=2026-10-12&view=day&page=1');
    expect(
      await screen.findByRole('region', { name: 'Schedule for 2026-10-12' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Weekly' }));
    const monday = await screen.findByRole('region', {
      name: 'Schedule for 2026-10-12',
    });
    const tuesday = await screen.findByRole('region', {
      name: 'Schedule for 2026-10-13',
    });
    expect(
      within(monday).getByRole('link', { name: patient.name }),
    ).toBeVisible();
    expect(
      within(tuesday).getByRole('link', { name: patient.name }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Schedule for 2026-10-18' }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      '/api/appointments?from=2026-10-12&to=2026-10-19&page=1',
      expect.anything(),
    );
  });
  it('creates an appointment and sends UTC instants', async () => {
    renderPage('/appointments/new');
    await screen.findByLabelText('Patient');
    fireEvent.change(screen.getByLabelText('Patient'), {
      target: { value: id },
    });
    fireEvent.change(screen.getByLabelText('Assigned dentist'), {
      target: { value: 'dentist-id' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-10-12T09:00' },
    });
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-10-12T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));
    expect(
      await screen.findByRole('heading', { name: 'Appointments' }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      '/api/appointments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          patientId: id,
          dentistId: 'dentist-id',
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          status: 'scheduled',
          notes: null,
        }),
      }),
    );
  });
  it('reschedules and changes status using the existing patient and dentist', async () => {
    renderPage(`/appointments/${id}/edit`);
    expect(await screen.findByLabelText('Start time')).toHaveValue(
      '2026-10-12T09:00',
    );
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-10-12T10:00' },
    });
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-10-12T11:00' },
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));
    await screen.findByRole('heading', { name: 'Appointments' });
    expect(await screen.findByText('completed')).toBeVisible();
    expect(record.startAt).toBe('2026-10-12T02:00:00.000Z');
  });
  it('requires confirmation for cancellation and retains the cancelled appointment', async () => {
    renderPage('/appointments?date=2026-10-12');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel appointment' }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/appointments/${id}/cancel`,
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );
    expect(await screen.findByText('cancelled')).toBeVisible();
    expect(screen.getByRole('link', { name: patient.name })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel appointment' }),
    ).not.toBeInTheDocument();
  });
  it('preserves sub-minute instants when editing only notes', async () => {
    record = {
      ...record,
      startAt: '2026-10-12T01:00:30.123Z',
      endAt: '2026-10-12T02:00:30.456Z',
    };
    renderPage(`/appointments/${id}/edit`);
    expect(await screen.findByLabelText('Start time')).toHaveValue(
      '2026-10-12T09:00:30',
    );
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Changed note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));
    await screen.findByRole('heading', { name: 'Appointments' });
    expect(record.startAt).toBe('2026-10-12T01:00:30.123Z');
    expect(record.endAt).toBe('2026-10-12T02:00:30.456Z');
  });
  it.each([400, 409])(
    'keeps entered data and displays %s errors',
    async (status) => {
      saveStatus = status;
      renderPage(`/appointments/${id}/edit`);
      await screen.findByLabelText('Notes (optional)');
      fireEvent.change(screen.getByLabelText('Notes (optional)'), {
        target: { value: 'Keep this note' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 409
          ? 'already has an appointment'
          : 'Invalid appointment details',
      );
      expect(screen.getByLabelText('Notes (optional)')).toHaveValue(
        'Keep this note',
      );
    },
  );
  it('searches active patients for booking', async () => {
    renderPage('/appointments/new');
    fireEvent.change(await screen.findByLabelText('Search active patients'), {
      target: { value: 'Synthetic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search patients' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/patients?q=Synthetic&page=1&status=active',
        expect.anything(),
      ),
    );
  });
  it('lets administrators designate an existing staff record as a dentist', async () => {
    role = 'admin';
    renderPage('/staff');
    fireEvent.change(await screen.findByLabelText('Existing staff'), {
      target: { value: 'staff' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Designate as dentist' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Dentist designation updated',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/appointments/dentists/staff',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ isDentist: true }),
      }),
    );
  });
});
