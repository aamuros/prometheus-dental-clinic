import { notFound, redirect } from '@tanstack/react-router';
import { appointmentStatuses } from '../../../shared/appointments';
import type {
  Appointment,
  AppointmentInput,
  AppointmentList,
  AppointmentSearch,
  Dentist,
  SchedulingStaff,
} from '../../../shared/appointments';

export class AppointmentApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function field(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string')
    throw new Error('Invalid appointment response');
  return result;
}
function readAppointment(value: unknown): Appointment {
  if (!object(value)) throw new Error('Invalid appointment response');
  const status = appointmentStatuses.find((status) => status === value.status);
  if (!status || (value.notes !== null && typeof value.notes !== 'string'))
    throw new Error('Invalid appointment response');
  return {
    id: field(value, 'id'),
    patientId: field(value, 'patientId'),
    dentistId: field(value, 'dentistId'),
    startAt: field(value, 'startAt'),
    endAt: field(value, 'endAt'),
    patientName: field(value, 'patientName'),
    dentistName: field(value, 'dentistName'),
    createdAt: field(value, 'createdAt'),
    updatedAt: field(value, 'updatedAt'),
    status,
    notes: value.notes,
  };
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const data: unknown = await response.json();
  if (!response.ok)
    throw new AppointmentApiError(
      response.status,
      object(data) && typeof data.error === 'string'
        ? data.error
        : 'Appointment request failed',
    );
  return data;
}
function envelope(value: unknown) {
  if (!object(value)) throw new Error('Invalid appointment response');
  return readAppointment(value.appointment);
}
async function load<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppointmentApiError && error.status === 401)
      throw redirect({ to: '/login' });
    if (error instanceof AppointmentApiError && error.status === 404)
      throw notFound();
    throw error;
  }
}
export function loadAppointments(
  search: AppointmentSearch,
  signal: AbortSignal,
): Promise<AppointmentList> {
  return load(async () => {
    const params = new URLSearchParams({
      from: search.from,
      to: search.to,
      page: String(search.page),
    });
    const data = await request(`/api/appointments?${params}`, { signal });
    if (
      !object(data) ||
      !Array.isArray(data.appointments) ||
      typeof data.page !== 'number' ||
      typeof data.hasMore !== 'boolean'
    )
      throw new Error('Invalid appointment list');
    return {
      appointments: data.appointments.map(readAppointment),
      page: data.page,
      hasMore: data.hasMore,
    };
  });
}
export function loadAppointment(id: string, signal: AbortSignal) {
  return load(async () =>
    envelope(
      await request(`/api/appointments/${encodeURIComponent(id)}`, { signal }),
    ),
  );
}
export function loadDentists(signal: AbortSignal): Promise<Dentist[]> {
  return load(async () => {
    const data = await request('/api/appointments/dentists', { signal });
    if (!object(data) || !Array.isArray(data.dentists))
      throw new Error('Invalid dentist list');
    return data.dentists.map((value: unknown) => {
      if (!object(value)) throw new Error('Invalid dentist response');
      return { id: field(value, 'id'), name: field(value, 'name') };
    });
  });
}
export async function saveAppointment(input: AppointmentInput, id?: string) {
  return envelope(
    await request(
      id ? `/api/appointments/${encodeURIComponent(id)}` : '/api/appointments',
      {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
}
export async function cancelAppointment(id: string) {
  return envelope(
    await request(`/api/appointments/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),
  );
}
export function loadSchedulingStaff(
  signal: AbortSignal,
): Promise<SchedulingStaff[]> {
  return load(async () => {
    const data = await request('/api/appointments/staff', { signal });
    if (!object(data) || !Array.isArray(data.staff))
      throw new Error('Invalid scheduling staff');
    return data.staff.map((value: unknown) => {
      if (!object(value) || typeof value.isDentist !== 'boolean')
        throw new Error('Invalid scheduling staff');
      return {
        id: field(value, 'id'),
        name: field(value, 'name'),
        isDentist: value.isDentist,
      };
    });
  });
}
export async function designateDentist(id: string, isDentist: boolean) {
  await request(`/api/appointments/dentists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDentist }),
  });
}
