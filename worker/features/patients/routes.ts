import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createDatabase } from '../../db/client';
import { requireAdmin, type AuthEnv } from '../auth/middleware';
import {
  archivePatient,
  createPatient,
  findPatient,
  listPatients,
  updatePatient,
} from './queries';
import { isPatientId, parsePatient, parsePatientSearch } from './validation';

// Mounted after the application's requireSession middleware.
export const patientRoutes = new Hono<AuthEnv>();
patientRoutes.use('*', bodyLimit({ maxSize: 8192 }));
patientRoutes.use('*', async (c, next) => {
  if (
    !['GET', 'HEAD'].includes(c.req.method) &&
    c.req.header('Origin') !== c.env.BETTER_AUTH_URL
  ) {
    return c.json({ error: 'Untrusted request origin' }, 403);
  }
  await next();
});

patientRoutes.get('/', async (c) => {
  const search = parsePatientSearch(new URL(c.req.url).searchParams);
  if (!search) return c.json({ error: 'Invalid patient search' }, 400);
  return c.json(await listPatients(createDatabase(c.env), search));
});

patientRoutes.post('/', async (c) => {
  const input = parsePatient(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid patient details' }, 400);
  const patient = await createPatient(createDatabase(c.env), input);
  if (!patient) throw new Error('Patient insert failed');
  return c.json({ patient }, 201);
});

patientRoutes.use('/:id/*', async (c, next) => {
  if (!isPatientId(c.req.param('id')))
    return c.json({ error: 'Invalid patient ID' }, 400);
  await next();
});

patientRoutes.get('/:id', async (c) => {
  const patient = await findPatient(createDatabase(c.env), c.req.param('id'));
  return patient
    ? c.json({ patient })
    : c.json({ error: 'Patient not found' }, 404);
});

patientRoutes.put('/:id', async (c) => {
  const input = parsePatient(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid patient details' }, 400);
  const db = createDatabase(c.env);
  const patient = await updatePatient(db, c.req.param('id'), input);
  if (patient) return c.json({ patient });
  const existing = await findPatient(db, c.req.param('id'));
  return existing
    ? c.json({ error: 'Archived patients cannot be edited' }, 409)
    : c.json({ error: 'Patient not found' }, 404);
});

patientRoutes.post('/:id/archive', requireAdmin, async (c) => {
  const db = createDatabase(c.env);
  const patient =
    (await archivePatient(db, c.req.param('id'))) ??
    (await findPatient(db, c.req.param('id')));
  return patient
    ? c.json({ patient })
    : c.json({ error: 'Patient not found' }, 404);
});

patientRoutes.all('/:id', (c) => {
  c.header('Allow', 'GET, HEAD, PUT');
  return c.json({ error: 'Method not allowed' }, 405);
});
