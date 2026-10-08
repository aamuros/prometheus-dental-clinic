import { and, asc, eq, ilike, isNotNull, isNull, or } from 'drizzle-orm';
import type { PatientInput, PatientSearch } from '../../../shared/patients';
import type { createDatabase } from '../../db/client';
import { patients } from './schema';

type Database = ReturnType<typeof createDatabase>;
const pageSize = 50;

export async function listPatients(db: Database, search: PatientSearch) {
  // Treat %, _ and backslashes as literal search text; Drizzle binds the value.
  const pattern = `%${search.q.replace(/[\\%_]/g, '\\$&')}%`;
  const records = await db
    .select()
    .from(patients)
    .where(
      and(
        search.status === 'active'
          ? isNull(patients.archivedAt)
          : isNotNull(patients.archivedAt),
        search.q
          ? or(
              ilike(patients.name, pattern),
              ilike(patients.contactNumber, pattern),
              ilike(patients.email, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(patients.name), asc(patients.id))
    .limit(pageSize + 1)
    .offset((search.page - 1) * pageSize);
  return {
    patients: records.slice(0, pageSize),
    page: search.page,
    hasMore: records.length > pageSize,
  };
}

export async function findPatient(db: Database, id: string) {
  return (
    await db.select().from(patients).where(eq(patients.id, id)).limit(1)
  )[0];
}

export async function createPatient(db: Database, input: PatientInput) {
  return (await db.insert(patients).values(input).returning())[0];
}

export async function updatePatient(
  db: Database,
  id: string,
  input: PatientInput,
) {
  return (
    await db
      .update(patients)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(patients.id, id), isNull(patients.archivedAt)))
      .returning()
  )[0];
}

export async function archivePatient(db: Database, id: string) {
  const now = new Date();
  return (
    await db
      .update(patients)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(patients.id, id), isNull(patients.archivedAt)))
      .returning()
  )[0];
}
