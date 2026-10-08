import { notFound, redirect } from '@tanstack/react-router';
import type {
  Patient,
  PatientInput,
  PatientList,
  PatientSearch,
} from '../../../shared/patients';

export class PatientApiError extends Error {
  constructor(public status: number) {
    super('Patient request failed');
  }
}

function readPatient(value: unknown): Patient {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('birthDate' in value) ||
    typeof value.birthDate !== 'string' ||
    !('contactNumber' in value) ||
    typeof value.contactNumber !== 'string' ||
    !('email' in value) ||
    (value.email !== null && typeof value.email !== 'string') ||
    !('createdAt' in value) ||
    typeof value.createdAt !== 'string' ||
    !('updatedAt' in value) ||
    typeof value.updatedAt !== 'string' ||
    !('archivedAt' in value) ||
    (value.archivedAt !== null && typeof value.archivedAt !== 'string')
  )
    throw new Error('Invalid patient response');
  return {
    id: value.id,
    name: value.name,
    birthDate: value.birthDate,
    contactNumber: value.contactNumber,
    email: value.email,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    archivedAt: value.archivedAt,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  if (!response.ok) throw new PatientApiError(response.status);
  return response.json();
}

function readEnvelope(value: unknown) {
  if (!value || typeof value !== 'object' || !('patient' in value))
    throw new Error('Invalid patient response');
  return readPatient(value.patient);
}

export async function loadPatients(
  search: PatientSearch,
  signal: AbortSignal,
): Promise<PatientList> {
  try {
    const params = new URLSearchParams({
      q: search.q,
      page: String(search.page),
      status: search.status,
    });
    const data = await request(`/api/patients?${params}`, { signal });
    if (
      !data ||
      typeof data !== 'object' ||
      !('patients' in data) ||
      !Array.isArray(data.patients) ||
      !('page' in data) ||
      typeof data.page !== 'number' ||
      !('hasMore' in data) ||
      typeof data.hasMore !== 'boolean'
    )
      throw new Error('Invalid patient list');
    return {
      patients: data.patients.map(readPatient),
      page: data.page,
      hasMore: data.hasMore,
    };
  } catch (error) {
    if (error instanceof PatientApiError && error.status === 401)
      throw redirect({ to: '/login' });
    throw error;
  }
}

export async function loadPatient(
  id: string,
  signal: AbortSignal,
): Promise<Patient> {
  try {
    return readEnvelope(
      await request(`/api/patients/${encodeURIComponent(id)}`, { signal }),
    );
  } catch (error) {
    if (error instanceof PatientApiError && error.status === 401)
      throw redirect({ to: '/login' });
    if (error instanceof PatientApiError && error.status === 404)
      throw notFound();
    throw error;
  }
}

export async function savePatient(
  input: PatientInput,
  id?: string,
): Promise<Patient> {
  return readEnvelope(
    await request(
      id ? `/api/patients/${encodeURIComponent(id)}` : '/api/patients',
      {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function archivePatient(id: string): Promise<Patient> {
  return readEnvelope(
    await request(`/api/patients/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }),
  );
}
