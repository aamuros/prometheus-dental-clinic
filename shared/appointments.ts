export const appointmentStatuses = [
  'scheduled',
  'completed',
  'cancelled',
  'no-show',
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export const clinicTimezone = 'Asia/Manila';

export type AppointmentInput = {
  patientId: string;
  dentistId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
};
export type Appointment = AppointmentInput & {
  id: string;
  patientName: string;
  dentistName: string;
  createdAt: string;
  updatedAt: string;
};
export type Dentist = { id: string; name: string };
export type SchedulingStaff = Dentist & { isDentist: boolean };
export type AppointmentSearch = { from: string; to: string; page: number };
export type AppointmentList = {
  appointments: Appointment[];
  page: number;
  hasMore: boolean;
};

export function isClinicDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function clinicDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function addClinicDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function clinicDayStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

export function clinicWeekStart(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addClinicDays(date, -((weekday + 6) % 7));
}

export function clinicDateTime(utc: string, includeSeconds = false) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utc));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}${includeSeconds ? `:${part('second')}` : ''}`;
}

export function clinicInputToUtc(value: string) {
  return new Date(
    `${value}${value.length === 16 ? ':00' : ''}+08:00`,
  ).toISOString();
}
