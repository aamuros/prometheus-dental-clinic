import {
  and,
  asc,
  eq,
  gt,
  isNull,
  lt,
  ne,
  or,
  sql,
  getTableColumns,
} from 'drizzle-orm';
import type {
  AppointmentInput,
  AppointmentSearch,
} from '../../../shared/appointments.js';
import { clinicDayStart } from '../../../shared/appointments.js';
import type { createDatabase } from '../../db/client.js';
import { user } from '../../db/schema.js';
import { patients } from '../patients/schema.js';
import { appointments } from './schema.js';

type Database = ReturnType<typeof createDatabase>;
export class AppointmentError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function selectAppointments(db: Database) {
  return db
    .select({
      ...getTableColumns(appointments),
      patientName: patients.name,
      dentistName: user.name,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(user, eq(appointments.dentistId, user.id));
}

export async function listAppointments(
  db: Database,
  search: AppointmentSearch,
) {
  const rows = await selectAppointments(db)
    .where(
      and(
        lt(appointments.startAt, new Date(clinicDayStart(search.to))),
        gt(appointments.endAt, new Date(clinicDayStart(search.from))),
      ),
    )
    .orderBy(asc(appointments.startAt), asc(appointments.id))
    .limit(51)
    .offset((search.page - 1) * 50);
  return {
    appointments: rows.slice(0, 50),
    page: search.page,
    hasMore: rows.length > 50,
  };
}

export async function listDentists(db: Database) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      and(
        eq(user.isDentist, true),
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    .orderBy(asc(user.name), asc(user.id));
}

export async function listSchedulingStaff(db: Database) {
  return db
    .select({ id: user.id, name: user.name, isDentist: user.isDentist })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(asc(user.name), asc(user.id));
}

export async function designateDentist(
  db: Database,
  id: string,
  isDentist: boolean,
) {
  return (
    await db
      .update(user)
      .set({ isDentist, updatedAt: new Date() })
      .where(
        and(eq(user.id, id), or(isNull(user.banned), eq(user.banned, false))),
      )
      .returning({ id: user.id, name: user.name, isDentist: user.isDentist })
  )[0];
}

export async function findAppointment(db: Database, id: string) {
  return (
    await selectAppointments(db).where(eq(appointments.id, id)).limit(1)
  )[0];
}

async function validateReferences(
  db: Database,
  input: AppointmentInput,
  existing?: typeof appointments.$inferSelect,
) {
  const unchangedSlot =
    existing &&
    existing.patientId === input.patientId &&
    existing.dentistId === input.dentistId &&
    existing.startAt.toISOString() === input.startAt &&
    existing.endAt.toISOString() === input.endAt;
  // Existing history stays editable after a patient is archived or a dentist is
  // disabled. Reopening a cancelled slot must validate current eligibility.
  if (
    unchangedSlot &&
    !(existing.status === 'cancelled' && input.status !== 'cancelled')
  )
    return;
  const patient = (
    await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt)))
      .limit(1)
  )[0];
  if (!patient) throw new AppointmentError(400, 'Choose an active patient');
  const dentist = (
    await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.id, input.dentistId),
          eq(user.isDentist, true),
          or(isNull(user.banned), eq(user.banned, false)),
        ),
      )
      .limit(1)
  )[0];
  if (!dentist) throw new AppointmentError(400, 'Choose an available dentist');
}

function values(input: AppointmentInput) {
  return {
    ...input,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
  };
}

export async function createAppointment(db: Database, input: AppointmentInput) {
  await validateReferences(db, input);
  const row = (
    await db
      .insert(appointments)
      .values(values(input))
      .returning({ id: appointments.id })
  )[0];
  if (!row) throw new Error('Appointment insert failed');
  return findAppointment(db, row.id);
}

export async function updateAppointment(
  db: Database,
  id: string,
  input: AppointmentInput,
) {
  const existing = await findAppointment(db, id);
  if (!existing) throw new AppointmentError(404, 'Appointment not found');
  await validateReferences(db, input, existing);
  const row = (
    await db
      .update(appointments)
      .set({ ...values(input), updatedAt: sql`clock_timestamp()` })
      .where(eq(appointments.id, id))
      .returning({ id: appointments.id })
  )[0];
  if (!row) throw new AppointmentError(404, 'Appointment not found');
  return findAppointment(db, row.id);
}

export async function cancelAppointment(db: Database, id: string) {
  await db
    .update(appointments)
    .set({ status: 'cancelled', updatedAt: sql`clock_timestamp()` })
    .where(and(eq(appointments.id, id), ne(appointments.status, 'cancelled')));
  return findAppointment(db, id);
}

export async function deleteAppointment(db: Database, id: string) {
  return (
    await db
      .delete(appointments)
      .where(eq(appointments.id, id))
      .returning({ id: appointments.id })
  )[0];
}

export function appointmentDatabaseError(
  error: unknown,
): AppointmentError | null {
  if (error instanceof AppointmentError) return error;
  // Drizzle wraps Neon errors in cause. Match controlled SQLSTATE/constraint
  // metadata, never the provider's message (which contains private row data).
  if (error && typeof error === 'object') {
    if (
      'code' in error &&
      error.code === '23P01' &&
      'constraint' in error &&
      error.constraint === 'appointments_dentist_overlap'
    )
      return new AppointmentError(
        409,
        'This dentist already has an appointment during that time.',
      );
    if ('code' in error && (error.code === '23503' || error.code === '23001'))
      if (
        'constraint' in error &&
        (error.constraint ===
          'dental_records_appointment_id_appointments_id_fk' ||
          error.constraint === 'dental_records_appointment_patient_dentist_fk')
      )
        return new AppointmentError(
          409,
          'This appointment is linked to a clinical record. Its patient and dentist cannot be changed, and it cannot be deleted.',
        );
    if ('code' in error && error.code === '23503')
      return new AppointmentError(
        400,
        'Patient or dentist is no longer available',
      );
    if ('cause' in error && error.cause !== error)
      return appointmentDatabaseError(error.cause);
  }
  return null;
}
