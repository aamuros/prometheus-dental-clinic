import { notFound, redirect } from '@tanstack/react-router';
import type { Dentist } from '../../../shared/appointments';
import type {
  DentalRecord,
  DentalRecordDetails,
  DentalRecordInput,
  DentalRecordKind,
  DentalRecordList,
} from '../../../shared/dental-records';
import { isFdiTooth } from '../../../shared/dental-records';

export class DentalRecordApiError extends Error {
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
  if (typeof value[key] !== 'string')
    throw new Error('Invalid dental record response');
  return value[key];
}
function integer(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 1)
    throw new Error('Invalid dental record response');
  return result;
}
function nullable(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === null) return null;
  return field(value, key);
}
function readInput(value: unknown): DentalRecordInput {
  if (
    !object(value) ||
    (value.kind !== 'note' && value.kind !== 'treatment') ||
    !Array.isArray(value.toothNumbers) ||
    !value.toothNumbers.every(
      (tooth: unknown): tooth is number =>
        typeof tooth === 'number' && isFdiTooth(tooth),
    )
  )
    throw new Error('Invalid dental record response');
  return {
    patientId: field(value, 'patientId'),
    kind: value.kind,
    clinicalNotes: nullable(value, 'clinicalNotes'),
    diagnosis: nullable(value, 'diagnosis'),
    procedures: nullable(value, 'procedures'),
    toothNumbers: value.toothNumbers,
    treatmentDate: field(value, 'treatmentDate'),
    dentistId: field(value, 'dentistId'),
    appointmentId: nullable(value, 'appointmentId'),
  };
}
function readRecord(value: unknown): DentalRecord {
  if (!object(value)) throw new Error('Invalid dental record response');
  return {
    ...readInput(value),
    id: field(value, 'id'),
    version: integer(value, 'version'),
    dentistName: field(value, 'dentistName'),
    createdBy: field(value, 'createdBy'),
    updatedBy: field(value, 'updatedBy'),
    createdAt: field(value, 'createdAt'),
    updatedAt: field(value, 'updatedAt'),
  };
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/dental-records${path}`, init);
  const data: unknown = await response.json();
  if (!response.ok)
    throw new DentalRecordApiError(
      response.status,
      object(data) && typeof data.error === 'string'
        ? data.error
        : 'Dental record request failed',
    );
  return data;
}
export async function loadDentalRecords(
  patientId: string,
  kind: DentalRecordKind,
  page: number,
  signal: AbortSignal,
): Promise<DentalRecordList | null> {
  try {
    const data = await request(
      `?${new URLSearchParams({ patientId, kind, page: String(page) })}`,
      { signal },
    );
    if (
      !object(data) ||
      !Array.isArray(data.records) ||
      typeof data.hasMore !== 'boolean'
    )
      throw new Error('Invalid dental record list');
    return {
      records: data.records.map(readRecord),
      page: integer(data, 'page'),
      hasMore: data.hasMore,
    };
  } catch (error) {
    if (error instanceof DentalRecordApiError && error.status === 403)
      return null;
    if (error instanceof DentalRecordApiError && error.status === 401)
      throw redirect({ to: '/login' });
    if (error instanceof DentalRecordApiError && error.status === 404)
      throw notFound();
    throw error;
  }
}
export async function loadRecordDetails(
  id: string,
  page = 1,
): Promise<DentalRecordDetails> {
  const data = await request(`/${encodeURIComponent(id)}?page=${page}`);
  if (
    !object(data) ||
    !Array.isArray(data.history) ||
    typeof data.hasMore !== 'boolean'
  )
    throw new Error('Invalid clinical history');
  return {
    record: readRecord(data.record),
    page: integer(data, 'page'),
    hasMore: data.hasMore,
    history: data.history.map((change: unknown) => {
      if (!object(change)) throw new Error('Invalid clinical history');
      return {
        version: integer(change, 'version'),
        snapshot: readInput(change.snapshot),
        dentistName: field(change, 'dentistName'),
        changedBy: field(change, 'changedBy'),
        changedByName: field(change, 'changedByName'),
        changedAt: field(change, 'changedAt'),
      };
    }),
  };
}
export type RecordOptions = {
  dentists: Dentist[];
  appointments: {
    id: string;
    startAt: string;
    status: string;
    dentistId: string;
    dentistName: string;
  }[];
};
export async function loadRecordOptions(
  patientId: string,
): Promise<RecordOptions> {
  const data = await request(`/options?${new URLSearchParams({ patientId })}`);
  if (
    !object(data) ||
    !Array.isArray(data.dentists) ||
    !Array.isArray(data.appointments)
  )
    throw new Error('Invalid clinical options');
  return {
    dentists: data.dentists.map((value: unknown) => {
      if (!object(value)) throw new Error('Invalid dentist');
      return { id: field(value, 'id'), name: field(value, 'name') };
    }),
    appointments: data.appointments.map((value: unknown) => {
      if (!object(value)) throw new Error('Invalid appointment');
      return {
        id: field(value, 'id'),
        startAt: field(value, 'startAt'),
        status: field(value, 'status'),
        dentistId: field(value, 'dentistId'),
        dentistName: field(value, 'dentistName'),
      };
    }),
  };
}
export async function saveDentalRecord(
  input: DentalRecordInput,
  record?: DentalRecord,
) {
  const data = await request(
    record ? `/${encodeURIComponent(record.id)}` : '',
    {
      method: record ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        ...(record ? { version: record.version } : {}),
      }),
    },
  );
  if (!object(data)) throw new Error('Invalid dental record response');
  return readRecord(data.record);
}
