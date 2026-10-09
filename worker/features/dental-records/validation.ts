import { clinicDate, isClinicDate } from '../../../shared/appointments.js';
import {
  isFdiTooth,
  type DentalRecordInput,
} from '../../../shared/dental-records.js';
import { isStaffId } from '../appointments/validation.js';
import { isPatientId } from '../patients/validation.js';

function text(value: unknown, max: number): string | null | false {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) return false;
  if (
    [...value].some(
      (char) =>
        (char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char)) ||
        char.charCodeAt(0) === 127,
    )
  )
    return false;
  return value.trim() || null;
}

export function parseDentalRecord(
  body: unknown,
  updating = false,
): (DentalRecordInput & { version?: number }) | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value: Record<string, unknown> = { ...body };
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'patientId',
          'kind',
          'clinicalNotes',
          'diagnosis',
          'procedures',
          'toothNumbers',
          'treatmentDate',
          'dentistId',
          'appointmentId',
          ...(updating ? ['version'] : []),
        ].includes(key),
    )
  )
    return null;
  if (
    typeof value.patientId !== 'string' ||
    !isPatientId(value.patientId) ||
    !isStaffId(value.dentistId) ||
    (value.kind !== 'note' && value.kind !== 'treatment')
  )
    return null;
  if (
    typeof value.treatmentDate !== 'string' ||
    !isClinicDate(value.treatmentDate) ||
    value.treatmentDate > clinicDate()
  )
    return null;
  const clinicalNotes = text(value.clinicalNotes, 4000);
  const diagnosis = text(value.diagnosis, 2000);
  const procedures = text(value.procedures, 2000);
  if (
    clinicalNotes === false ||
    diagnosis === false ||
    procedures === false ||
    (value.kind === 'note' && !clinicalNotes) ||
    (value.kind === 'treatment' && !procedures)
  )
    return null;
  const toothNumbers: unknown = value.toothNumbers ?? [];
  if (
    !Array.isArray(toothNumbers) ||
    toothNumbers.length > 52 ||
    !toothNumbers.every(
      (tooth: unknown): tooth is number =>
        typeof tooth === 'number' && isFdiTooth(tooth),
    ) ||
    new Set(toothNumbers).size !== toothNumbers.length
  )
    return null;
  const appointmentId = value.appointmentId ?? null;
  if (
    appointmentId !== null &&
    (typeof appointmentId !== 'string' || !isPatientId(appointmentId))
  )
    return null;
  if (
    updating &&
    (typeof value.version !== 'number' ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1 ||
      value.version >= 2147483647)
  )
    return null;
  return {
    patientId: value.patientId,
    kind: value.kind,
    dentistId: value.dentistId,
    treatmentDate: value.treatmentDate,
    clinicalNotes,
    diagnosis,
    procedures,
    toothNumbers,
    appointmentId,
    ...(updating && typeof value.version === 'number'
      ? { version: value.version }
      : {}),
  };
}

export function parseRecordPage(params: URLSearchParams, listing = false) {
  if (
    [...params.keys()].some(
      (key) =>
        !['page', ...(listing ? ['patientId', 'kind'] : [])].includes(key) ||
        params.getAll(key).length > 1,
    )
  )
    return null;
  const raw = params.get('page') ?? '1';
  const page = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(page) || page > 10000)
    return null;
  const patientId = params.get('patientId');
  const kind = params.get('kind') ?? 'note';
  if (
    listing &&
    (!patientId ||
      !isPatientId(patientId) ||
      (kind !== 'note' && kind !== 'treatment'))
  )
    return null;
  return { page, patientId, kind };
}
