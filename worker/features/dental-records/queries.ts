import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import type {
  DentalRecordInput,
  DentalRecordKind,
} from '../../../shared/dental-records';
import type { createDatabase } from '../../db/client';
import { user } from '../../db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { patients } from '../patients/schema';
import { appointments } from '../appointments/schema';
import { dentalRecords, dentalRecordHistory } from './schema';

type Database = ReturnType<typeof createDatabase>;
export class DentalRecordError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}
export async function isClinicalUser(db: Database, id: string) {
  return !!(
    await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.id, id),
          eq(user.isDentist, true),
          or(isNull(user.banned), eq(user.banned, false)),
        ),
      )
      .limit(1)
  )[0];
}
function selectRecords(db: Database) {
  return db
    .select({ ...getTableColumns(dentalRecords), dentistName: user.name })
    .from(dentalRecords)
    .innerJoin(user, eq(dentalRecords.dentistId, user.id));
}
export async function findDentalRecord(db: Database, id: string) {
  return (await selectRecords(db).where(eq(dentalRecords.id, id)).limit(1))[0];
}
export async function listDentalRecords(
  db: Database,
  patientId: string,
  kind: DentalRecordKind,
  page: number,
) {
  if (
    !(
      await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1)
    )[0]
  )
    throw new DentalRecordError(404, 'Patient not found');
  const rows = await selectRecords(db)
    .where(
      and(eq(dentalRecords.patientId, patientId), eq(dentalRecords.kind, kind)),
    )
    .orderBy(
      desc(dentalRecords.treatmentDate),
      desc(dentalRecords.createdAt),
      asc(dentalRecords.id),
    )
    .limit(51)
    .offset((page - 1) * 50);
  return { records: rows.slice(0, 50), page, hasMore: rows.length > 50 };
}
export async function dentalRecordDetails(
  db: Database,
  id: string,
  page: number,
) {
  const record = await findDentalRecord(db, id);
  if (!record) throw new DentalRecordError(404, 'Dental record not found');
  const dentist = alias(user, 'history_dentist');
  const history = await db
    .select({
      version: dentalRecordHistory.version,
      snapshot: dentalRecordHistory.snapshot,
      dentistName: sql<string>`coalesce(${dentist.name}, 'Previous dentist')`,
      changedBy: dentalRecordHistory.changedBy,
      changedByName: user.name,
      changedAt: dentalRecordHistory.changedAt,
    })
    .from(dentalRecordHistory)
    .innerJoin(user, eq(dentalRecordHistory.changedBy, user.id))
    .leftJoin(
      dentist,
      sql`${dentalRecordHistory.snapshot}->>'dentistId' = ${dentist.id}`,
    )
    .where(eq(dentalRecordHistory.recordId, id))
    .orderBy(desc(dentalRecordHistory.version))
    .limit(51)
    .offset((page - 1) * 50);
  return {
    record,
    history: history.slice(0, 50),
    page,
    hasMore: history.length > 50,
  };
}
export async function recordAppointments(db: Database, patientId: string) {
  return db
    .select({
      id: appointments.id,
      startAt: appointments.startAt,
      status: appointments.status,
      dentistId: appointments.dentistId,
      dentistName: user.name,
    })
    .from(appointments)
    .innerJoin(user, eq(appointments.dentistId, user.id))
    .where(
      and(
        eq(appointments.patientId, patientId),
        or(
          eq(appointments.status, 'scheduled'),
          eq(appointments.status, 'completed'),
        ),
      ),
    )
    .orderBy(desc(appointments.startAt), asc(appointments.id))
    .limit(50);
}
async function validateReferences(
  db: Database,
  input: DentalRecordInput,
  existing?: typeof dentalRecords.$inferSelect,
) {
  const patient = (
    await db
      .select()
      .from(patients)
      .where(eq(patients.id, input.patientId))
      .limit(1)
  )[0];
  if (!patient || (!existing && patient.archivedAt))
    throw new DentalRecordError(400, 'Choose an active patient');
  if (!existing || existing.dentistId !== input.dentistId) {
    if (!(await isClinicalUser(db, input.dentistId)))
      throw new DentalRecordError(400, 'Choose an available dentist');
  }
  if (
    input.appointmentId &&
    (!existing ||
      existing.appointmentId !== input.appointmentId ||
      existing.dentistId !== input.dentistId)
  ) {
    const appointment = (
      await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1)
    )[0];
    if (
      !appointment ||
      appointment.patientId !== input.patientId ||
      appointment.dentistId !== input.dentistId ||
      !['scheduled', 'completed'].includes(appointment.status)
    )
      throw new DentalRecordError(
        400,
        'Choose an appointment for this patient and dentist',
      );
  }
}
export async function createDentalRecord(
  db: Database,
  input: DentalRecordInput,
  actorId: string,
) {
  await validateReferences(db, input);
  // The database trigger writes the full revision in this same transaction.
  const row = (
    await db
      .insert(dentalRecords)
      .values({ ...input, createdBy: actorId, updatedBy: actorId })
      .returning({ id: dentalRecords.id })
  )[0];
  if (!row) throw new Error('Dental record insert failed');
  return findDentalRecord(db, row.id);
}
export async function updateDentalRecord(
  db: Database,
  id: string,
  input: DentalRecordInput,
  version: number,
  actorId: string,
) {
  const existing = await findDentalRecord(db, id);
  if (!existing) throw new DentalRecordError(404, 'Dental record not found');
  if (existing.patientId !== input.patientId || existing.kind !== input.kind)
    throw new DentalRecordError(
      400,
      'The patient and record type cannot be changed',
    );
  if (existing.version !== version)
    throw new DentalRecordError(
      409,
      'This record has changed. Reload the details before saving.',
    );
  await validateReferences(db, input, existing);
  const row = (
    await db
      .update(dentalRecords)
      .set({
        ...input,
        version: sql`${dentalRecords.version} + 1`,
        updatedBy: actorId,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(and(eq(dentalRecords.id, id), eq(dentalRecords.version, version)))
      .returning({ id: dentalRecords.id })
  )[0];
  if (!row)
    throw new DentalRecordError(
      409,
      'This record has changed. Reload the details before saving.',
    );
  return findDentalRecord(db, id);
}
export function dentalRecordDatabaseError(
  error: unknown,
): DentalRecordError | null {
  if (error instanceof DentalRecordError) return error;
  if (error && typeof error === 'object') {
    if ('code' in error && error.code === '23503')
      return new DentalRecordError(
        409,
        'A linked clinical record prevents deletion or the reference is no longer available.',
      );
    if ('cause' in error && error.cause !== error)
      return dentalRecordDatabaseError(error.cause);
  }
  return null;
}
