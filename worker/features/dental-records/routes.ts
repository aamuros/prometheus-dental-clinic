import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createDatabase } from '../../db/client';
import type { AuthEnv } from '../auth/middleware';
import { isPatientId } from '../patients/validation';
import { listDentists } from '../appointments/queries';
import {
  createDentalRecord,
  dentalRecordDatabaseError,
  dentalRecordDetails,
  isClinicalUser,
  listDentalRecords,
  recordAppointments,
  updateDentalRecord,
} from './queries';
import { parseDentalRecord, parseRecordPage } from './validation';

export const dentalRecordRoutes = new Hono<AuthEnv>();
// Check the current designation in the database on every request, including
// reads. Staff/admin roles alone never grant access to private clinical data.
dentalRecordRoutes.use('*', async (c, next) => {
  if (
    !(await isClinicalUser(
      createDatabase(c.env),
      c.get('staffSession').user.id,
    ))
  )
    return c.json({ error: 'Clinical dentist access required' }, 403);
  if (
    !['GET', 'HEAD'].includes(c.req.method) &&
    c.req.header('Origin') !== c.env.BETTER_AUTH_URL
  )
    return c.json({ error: 'Untrusted request origin' }, 403);
  await next();
});
dentalRecordRoutes.use('*', bodyLimit({ maxSize: 32768 }));
dentalRecordRoutes.onError((error, c) => {
  const known = dentalRecordDatabaseError(error);
  if (known) return c.json({ error: known.message }, known.status);
  throw error;
});
dentalRecordRoutes.get('/options', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const patientId = params.get('patientId');
  if (
    !patientId ||
    !isPatientId(patientId) ||
    [...params.keys()].some((key) => key !== 'patientId') ||
    params.getAll('patientId').length !== 1
  )
    return c.json({ error: 'Invalid patient ID' }, 400);
  const db = createDatabase(c.env);
  const [dentists, appointments] = await Promise.all([
    listDentists(db),
    recordAppointments(db, patientId),
  ]);
  return c.json({ dentists, appointments });
});
dentalRecordRoutes.get('/', async (c) => {
  const search = parseRecordPage(new URL(c.req.url).searchParams, true);
  if (
    !search ||
    !search.patientId ||
    (search.kind !== 'note' && search.kind !== 'treatment')
  )
    return c.json({ error: 'Invalid dental record filters' }, 400);
  return c.json(
    await listDentalRecords(
      createDatabase(c.env),
      search.patientId,
      search.kind,
      search.page,
    ),
  );
});
dentalRecordRoutes.post('/', async (c) => {
  const input = parseDentalRecord(await c.req.json().catch(() => null));
  if (!input)
    return c.json(
      {
        error:
          'Invalid clinical details. Use a valid past or current date and FDI tooth numbers.',
      },
      400,
    );
  return c.json(
    {
      record: await createDentalRecord(
        createDatabase(c.env),
        input,
        c.get('staffSession').user.id,
      ),
    },
    201,
  );
});
dentalRecordRoutes.use('/:id', async (c, next) => {
  if (!isPatientId(c.req.param('id')))
    return c.json({ error: 'Invalid dental record ID' }, 400);
  await next();
});
dentalRecordRoutes.get('/:id', async (c) => {
  const search = parseRecordPage(new URL(c.req.url).searchParams);
  if (!search) return c.json({ error: 'Invalid history page' }, 400);
  return c.json(
    await dentalRecordDetails(
      createDatabase(c.env),
      c.req.param('id'),
      search.page,
    ),
  );
});
dentalRecordRoutes.put('/:id', async (c) => {
  const input = parseDentalRecord(await c.req.json().catch(() => null), true);
  if (!input || input.version === undefined)
    return c.json({ error: 'Invalid clinical details or record version' }, 400);
  const { version, ...fields } = input;
  return c.json({
    record: await updateDentalRecord(
      createDatabase(c.env),
      c.req.param('id'),
      fields,
      version,
      c.get('staffSession').user.id,
    ),
  });
});
dentalRecordRoutes.all('/:id', (c) => {
  c.header('Allow', 'GET, HEAD, PUT');
  return c.json({ error: 'Clinical records cannot be deleted' }, 405);
});
