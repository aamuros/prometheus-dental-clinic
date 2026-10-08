import {
  appointmentStatuses,
  isClinicDate,
  addClinicDays,
  clinicDate,
} from '../../../shared/appointments';
import type {
  AppointmentInput,
  AppointmentSearch,
  AppointmentStatus,
} from '../../../shared/appointments';
import { isPatientId } from '../patients/validation';

export function isStaffId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function isAppointmentStatus(
  value: unknown,
): value is AppointmentStatus {
  return appointmentStatuses.some((status) => status === value);
}

function parseInstant(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  if (!isClinicDate(value.slice(0, 10))) return null;
  const suffix = value.endsWith('Z') ? 'Z' : value.slice(-6);
  const hours = Number(suffix.slice(1, 3));
  const minutes = Number(suffix.slice(4, 6));
  if (suffix !== 'Z' && (hours > 23 || minutes > 59)) return null;
  const offset =
    suffix === 'Z' ? 0 : (hours * 60 + minutes) * (suffix[0] === '+' ? 1 : -1);
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + offset * 60000).toISOString().slice(0, 19) !==
      value.slice(0, 19)
  )
    return null;
  return date.toISOString();
}

export function parseAppointment(body: unknown): AppointmentInput | null {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          'patientId',
          'dentistId',
          'startAt',
          'endAt',
          'status',
          'notes',
        ].includes(key),
    ) ||
    !('patientId' in body) ||
    typeof body.patientId !== 'string' ||
    !isPatientId(body.patientId) ||
    !('dentistId' in body) ||
    !isStaffId(body.dentistId) ||
    !('startAt' in body) ||
    !('endAt' in body) ||
    !('status' in body) ||
    !isAppointmentStatus(body.status)
  )
    return null;
  const startAt = parseInstant(body.startAt);
  const endAt = parseInstant(body.endAt);
  const rawNotes = 'notes' in body ? body.notes : null;
  if (rawNotes !== null && typeof rawNotes !== 'string') return null;
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() || null : null;
  // Allow newlines/tabs in plain-text notes, but reject other control characters.
  if (
    notes &&
    (notes.length > 2000 ||
      [...notes].some(
        (char) =>
          (char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char)) ||
          char.charCodeAt(0) === 127,
      ))
  )
    return null;
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt))
    return null;
  return {
    patientId: body.patientId,
    dentistId: body.dentistId,
    startAt,
    endAt,
    status: body.status,
    notes,
  };
}

export function parseAppointmentSearch(
  params: URLSearchParams,
): AppointmentSearch | null {
  if (
    [...params.keys()].some(
      (key) =>
        !['from', 'to', 'page'].includes(key) || params.getAll(key).length > 1,
    )
  )
    return null;
  const from = params.get('from') ?? clinicDate();
  if (!isClinicDate(from)) return null;
  const to = params.get('to') ?? addClinicDays(from, 1);
  const pageValue = params.get('page') ?? '1';
  const page = Number(pageValue);
  if (
    !isClinicDate(to) ||
    to <= from ||
    Date.parse(to) - Date.parse(from) > 31 * 86400000 ||
    !/^[1-9]\d*$/.test(pageValue) ||
    !Number.isSafeInteger(page) ||
    page > 10000
  )
    return null;
  return { from, to, page };
}
