import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createDatabase } from '../../db/client.js';
import { requireAdmin, type AuthEnv } from '../auth/middleware.js';
import { isPatientId } from '../patients/validation.js';
import {
  appointmentDatabaseError,
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  designateDentist,
  findAppointment,
  listAppointments,
  listDentists,
  listSchedulingStaff,
  updateAppointment,
} from './queries.js';
import {
  isStaffId,
  parseAppointment,
  parseAppointmentSearch,
} from './validation.js';

// Mounted after requireSession: admin/staff may manage clinic-wide appointments;
// permanent deletion is restricted to admin, cancellation preserves history.
export const appointmentRoutes = new Hono<AuthEnv>();
appointmentRoutes.use('*', bodyLimit({ maxSize: 8192 }));
appointmentRoutes.use('*', async (c, next) => {
  if (
    !['GET', 'HEAD'].includes(c.req.method) &&
    c.req.header('Origin') !== c.env.BETTER_AUTH_URL
  )
    return c.json({ error: 'Untrusted request origin' }, 403);
  await next();
});
appointmentRoutes.onError((error, c) => {
  const known = appointmentDatabaseError(error);
  if (known) return c.json({ error: known.message }, known.status);
  throw error;
});

appointmentRoutes.get('/', async (c) => {
  const search = parseAppointmentSearch(new URL(c.req.url).searchParams);
  if (!search) return c.json({ error: 'Invalid appointment date range' }, 400);
  return c.json(await listAppointments(createDatabase(c.env), search));
});
appointmentRoutes.get('/dentists', async (c) =>
  c.json({ dentists: await listDentists(createDatabase(c.env)) }),
);
appointmentRoutes.get('/staff', requireAdmin, async (c) =>
  c.json({ staff: await listSchedulingStaff(createDatabase(c.env)) }),
);
appointmentRoutes.put('/dentists/:staffId', requireAdmin, async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (
    !isStaffId(c.req.param('staffId')) ||
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'isDentist') ||
    !('isDentist' in body) ||
    typeof body.isDentist !== 'boolean'
  )
    return c.json({ error: 'Invalid dentist designation' }, 400);
  const staff = await designateDentist(
    createDatabase(c.env),
    c.req.param('staffId'),
    body.isDentist,
  );
  return staff
    ? c.json({ staff })
    : c.json({ error: 'Available staff account not found' }, 404);
});
appointmentRoutes.post('/', async (c) => {
  const input = parseAppointment(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid appointment details' }, 400);
  return c.json(
    { appointment: await createAppointment(createDatabase(c.env), input) },
    201,
  );
});
appointmentRoutes.use('/:id/*', async (c, next) => {
  if (!isPatientId(c.req.param('id')))
    return c.json({ error: 'Invalid appointment ID' }, 400);
  await next();
});
appointmentRoutes.get('/:id', async (c) => {
  const appointment = await findAppointment(
    createDatabase(c.env),
    c.req.param('id'),
  );
  return appointment
    ? c.json({ appointment })
    : c.json({ error: 'Appointment not found' }, 404);
});
appointmentRoutes.put('/:id', async (c) => {
  const input = parseAppointment(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid appointment details' }, 400);
  return c.json({
    appointment: await updateAppointment(
      createDatabase(c.env),
      c.req.param('id'),
      input,
    ),
  });
});
appointmentRoutes.post('/:id/cancel', async (c) => {
  const appointment = await cancelAppointment(
    createDatabase(c.env),
    c.req.param('id'),
  );
  return appointment
    ? c.json({ appointment })
    : c.json({ error: 'Appointment not found' }, 404);
});
appointmentRoutes.delete('/:id', requireAdmin, async (c) => {
  const row = await deleteAppointment(createDatabase(c.env), c.req.param('id'));
  return row
    ? c.body(null, 204)
    : c.json({ error: 'Appointment not found' }, 404);
});
appointmentRoutes.all('/:id', (c) => {
  c.header('Allow', 'GET, HEAD, PUT, DELETE');
  return c.json({ error: 'Method not allowed' }, 405);
});
