import { clinicDate } from '../../../shared/appointments';
import type { PatientInput, PatientSearch } from '../../../shared/patients';

function hasControlCharacters(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function parsePatient(body: unknown): PatientInput | null {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !['name', 'birthDate', 'contactNumber', 'email'].includes(key),
    ) ||
    !('name' in body) ||
    typeof body.name !== 'string' ||
    !('birthDate' in body) ||
    typeof body.birthDate !== 'string' ||
    !('contactNumber' in body) ||
    typeof body.contactNumber !== 'string'
  )
    return null;
  const name = body.name.trim();
  const birthDate = body.birthDate;
  const contactNumber = body.contactNumber.trim();
  if (
    !name ||
    name.length > 200 ||
    hasControlCharacters(name) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    birthDate.startsWith('0000')
  )
    return null;
  const date = new Date(`${birthDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birthDate ||
    birthDate > clinicDate()
  )
    return null;
  if (contactNumber.length > 30 || !/^\+?[\d ()-]+$/.test(contactNumber))
    return null;
  const digits = contactNumber.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) return null;
  const rawEmail = 'email' in body ? body.email : null;
  if (rawEmail !== null && typeof rawEmail !== 'string') return null;
  const email = typeof rawEmail === 'string' ? rawEmail.trim() || null : null;
  if (
    email &&
    (email.length > 254 ||
      hasControlCharacters(email) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
  )
    return null;
  return { name, birthDate, contactNumber, email };
}

export function parsePatientSearch(
  params: URLSearchParams,
): PatientSearch | null {
  if (
    [...params.keys()].some(
      (key) =>
        !['q', 'page', 'status'].includes(key) || params.getAll(key).length > 1,
    )
  )
    return null;
  const q = (params.get('q') ?? '').trim();
  const pageValue = params.get('page') ?? '1';
  const status = params.get('status') ?? 'active';
  const page = Number(pageValue);
  if (
    q.length > 100 ||
    hasControlCharacters(q) ||
    !/^[1-9]\d*$/.test(pageValue) ||
    !Number.isSafeInteger(page) ||
    page > 10000 ||
    (status !== 'active' && status !== 'archived')
  )
    return null;
  return { q, page, status };
}

export function isPatientId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}
