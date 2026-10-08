import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker/app';
import * as queries from '../worker/features/appointments/queries';
import {
  parseAppointment,
  parseAppointmentSearch,
} from '../worker/features/appointments/validation';
import {
  addClinicDays,
  clinicDate,
  clinicDateTime,
  clinicDayStart,
  clinicInputToUtc,
  clinicWeekStart,
} from '../shared/appointments';

const state = vi.hoisted(() => ({ role: 'staff' as string | null }));
vi.mock('../worker/features/auth/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        state.role
          ? {
              user: {
                id: 'staff',
                name: 'Synthetic staff',
                email: 'staff@example.test',
                role: state.role,
              },
            }
          : null,
    },
  }),
}));
vi.mock('../worker/db/client', () => ({ createDatabase: vi.fn(() => ({})) }));
vi.mock('../worker/features/appointments/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof queries>()),
  listAppointments: vi.fn(),
  findAppointment: vi.fn(),
  listDentists: vi.fn(),
  listSchedulingStaff: vi.fn(),
  designateDentist: vi.fn(),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
}));
const origin = 'https://clinic.example.test';
const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
const input = {
  patientId: id,
  dentistId: 'dentist-id',
  startAt: '2026-10-09T01:00:00.000Z',
  endAt: '2026-10-09T02:00:00.000Z',
  status: 'scheduled',
  notes: null,
};
const record = {
  ...input,
  status: 'scheduled' as const,
  id,
  startAt: new Date(input.startAt),
  endAt: new Date(input.endAt),
  patientName: 'Synthetic patient',
  dentistName: 'Synthetic dentist',
  createdAt: new Date('2026-10-08T00:00:00Z'),
  updatedAt: new Date('2026-10-08T00:00:00Z'),
};
const env = {
  DATABASE_URL: 'unused',
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: 'test-only-secret-at-least-32-characters',
};
function request(
  path = '',
  method = 'GET',
  body?: unknown,
  requestOrigin: string | null = origin,
) {
  return app.request(
    `${origin}/api/appointments${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}
beforeEach(() => {
  state.role = 'staff';
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(queries.listAppointments).mockResolvedValue({
    appointments: [record],
    page: 1,
    hasMore: false,
  });
  vi.mocked(queries.listDentists).mockResolvedValue([
    { id: 'dentist-id', name: 'Synthetic dentist' },
  ]);
  vi.mocked(queries.findAppointment).mockResolvedValue(record);
  vi.mocked(queries.createAppointment).mockResolvedValue(record);
  vi.mocked(queries.updateAppointment).mockResolvedValue(record);
  vi.mocked(queries.cancelAppointment).mockResolvedValue({
    ...record,
    status: 'cancelled',
  });
  vi.mocked(queries.deleteAppointment).mockResolvedValue({ id });
  vi.mocked(queries.listSchedulingStaff).mockResolvedValue([
    { id: 'staff', name: 'Staff', isDentist: false },
  ]);
  vi.mocked(queries.designateDentist).mockResolvedValue({
    id: 'staff',
    name: 'Staff',
    isDentist: true,
  });
});

describe('Appointment API authorization and scheduling', () => {
  it.each(['admin', 'staff'])(
    'allows %s to list, create, read, reschedule and cancel',
    async (role) => {
      state.role = role;
      expect((await request('?from=2026-10-09&to=2026-10-10')).status).toBe(
        200,
      );
      expect((await request('/dentists')).status).toBe(200);
      const created = await request('', 'POST', input);
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({
        appointment: expect.objectContaining({
          id,
          startAt: input.startAt,
          endAt: input.endAt,
        }),
      });
      expect((await request(`/${id}`)).status).toBe(200);
      expect(
        (
          await request(`/${id}`, 'PUT', {
            ...input,
            startAt: '2026-10-09T03:00:00Z',
            endAt: '2026-10-09T04:00:00Z',
          })
        ).status,
      ).toBe(200);
      expect(queries.updateAppointment).toHaveBeenCalledWith(
        expect.anything(),
        id,
        expect.objectContaining({ startAt: '2026-10-09T03:00:00.000Z' }),
      );
      const cancelled = await request(`/${id}/cancel`, 'POST');
      expect(await cancelled.json()).toEqual({
        appointment: expect.objectContaining({ status: 'cancelled' }),
      });
    },
  );
  it.each(['scheduled', 'completed', 'cancelled', 'no-show'])(
    'accepts the %s status',
    async (status) => {
      expect(
        (await request(`/${id}`, 'PUT', { ...input, status })).status,
      ).toBe(200);
      expect(queries.updateAppointment).toHaveBeenCalledWith(
        expect.anything(),
        id,
        { ...input, status },
      );
    },
  );
  it('requires admin for deletion', async () => {
    expect((await request(`/${id}`, 'DELETE')).status).toBe(403);
    expect(queries.deleteAppointment).not.toHaveBeenCalled();
    state.role = 'admin';
    expect((await request(`/${id}`, 'DELETE')).status).toBe(204);
  });
  it('restricts dentist designation and staff listing to administrators', async () => {
    expect((await request('/staff')).status).toBe(403);
    expect(
      (await request('/dentists/staff', 'PUT', { isDentist: true })).status,
    ).toBe(403);
    expect(queries.designateDentist).not.toHaveBeenCalled();
    state.role = 'admin';
    expect((await request('/staff')).status).toBe(200);
    expect(
      (await request('/dentists/staff', 'PUT', { isDentist: true })).status,
    ).toBe(200);
    expect(queries.designateDentist).toHaveBeenCalledWith(
      expect.anything(),
      'staff',
      true,
    );
    for (const body of [
      null,
      {},
      [],
      { isDentist: 'true' },
      { isDentist: true, role: 'admin' },
    ])
      expect((await request('/dentists/staff', 'PUT', body)).status).toBe(400);
    vi.mocked(queries.designateDentist).mockResolvedValueOnce(undefined);
    expect(
      (await request('/dentists/missing', 'PUT', { isDentist: false })).status,
    ).toBe(404);
  });
  it.each([
    ['', 'GET'],
    ['/dentists', 'GET'],
    ['', 'POST'],
    [`/${id}`, 'GET'],
    [`/${id}`, 'PUT'],
    [`/${id}/cancel`, 'POST'],
    [`/${id}`, 'DELETE'],
  ])('denies anonymous %s %s', async (path, method) => {
    state.role = null;
    expect(
      (await request(path, method, method === 'GET' ? undefined : input))
        .status,
    ).toBe(401);
    for (const query of [
      queries.listAppointments,
      queries.listDentists,
      queries.findAppointment,
      queries.createAppointment,
      queries.updateAppointment,
      queries.cancelAppointment,
      queries.deleteAppointment,
    ])
      expect(query).not.toHaveBeenCalled();
  });
  it('denies unsupported roles', async () => {
    state.role = 'patient';
    expect((await request()).status).toBe(403);
    expect(queries.listAppointments).not.toHaveBeenCalled();
  });
  it.each([null, 'https://hostile.example.test'])(
    'rejects missing/hostile origin %s',
    async (requestOrigin) => {
      state.role = 'admin';
      for (const [path, method] of [
        ['', 'POST'],
        [`/${id}`, 'PUT'],
        [`/${id}/cancel`, 'POST'],
        [`/${id}`, 'DELETE'],
      ])
        expect((await request(path, method, input, requestOrigin)).status).toBe(
          403,
        );
      expect(queries.createAppointment).not.toHaveBeenCalled();
      expect(queries.cancelAppointment).not.toHaveBeenCalled();
    },
  );
  it('maps insert and reschedule exclusion errors without leaking database detail', async () => {
    const error = new Error('private patient details', {
      cause: { code: '23P01', constraint: 'appointments_dentist_overlap' },
    });
    vi.mocked(queries.createAppointment).mockRejectedValueOnce(error);
    vi.mocked(queries.updateAppointment).mockRejectedValueOnce(error);
    for (const [path, method] of [
      ['', 'POST'],
      [`/${id}`, 'PUT'],
    ]) {
      const response = await request(path, method, input);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'This dentist already has an appointment during that time.',
      });
    }
  });
  it('returns controlled invalid-reference and missing-record errors', async () => {
    vi.mocked(queries.createAppointment).mockRejectedValueOnce(
      new queries.AppointmentError(400, 'Choose an active patient'),
    );
    expect((await request('', 'POST', input)).status).toBe(400);
    vi.mocked(queries.findAppointment).mockResolvedValueOnce(undefined);
    vi.mocked(queries.cancelAppointment).mockResolvedValueOnce(undefined);
    vi.mocked(queries.updateAppointment).mockRejectedValueOnce(
      new queries.AppointmentError(404, 'Appointment not found'),
    );
    vi.mocked(queries.deleteAppointment).mockResolvedValueOnce(undefined);
    expect((await request(`/${id}`)).status).toBe(404);
    expect((await request(`/${id}/cancel`, 'POST')).status).toBe(404);
    expect((await request(`/${id}`, 'PUT', input)).status).toBe(404);
    state.role = 'admin';
    expect((await request(`/${id}`, 'DELETE')).status).toBe(404);
  });
  it('keeps unexpected errors, logs and caching safe', async () => {
    vi.mocked(queries.listAppointments).mockRejectedValueOnce(
      new Error('private notes and credentials'),
    );
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      'private',
    );
  });
});

describe('Appointment validation and clinic time', () => {
  it.each([
    null,
    [],
    {},
    { ...input, patientId: 'invalid' },
    { ...input, dentistId: '' },
    { ...input, dentistId: 'x'.repeat(129) },
    { ...input, status: 'pending' },
    { ...input, notes: 1 },
    { ...input, notes: 'x'.repeat(2001) },
    { ...input, notes: 'private\u0000' },
    { ...input, id },
    { ...input, endAt: input.startAt },
    { ...input, endAt: '2026-10-09T00:30:00Z' },
    { ...input, startAt: '2026-10-09T01:00:00' },
    { ...input, startAt: '2026-02-30T01:00:00Z' },
    { ...input, startAt: '2026-10-08T24:00:00Z' },
    { ...input, startAt: '2026-10-09T01:00:00+24:00' },
  ])('rejects invalid body %j on create/update', async (body) => {
    expect((await request('', 'POST', body)).status).toBe(400);
    expect((await request(`/${id}`, 'PUT', body)).status).toBe(400);
    expect(queries.createAppointment).not.toHaveBeenCalled();
  });
  it('normalizes timezone offsets and optional plain-text notes', () => {
    expect(
      parseAppointment({
        ...input,
        startAt: '2026-10-09T09:00:00+08:00',
        endAt: '2026-10-09T10:00:00+08:00',
        notes: '  Line one\nLine two  ',
      }),
    ).toEqual({ ...input, notes: 'Line one\nLine two' });
    const withoutNotes = {
      patientId: input.patientId,
      dentistId: input.dentistId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: input.status,
    };
    expect(parseAppointment(withoutNotes)?.notes).toBeNull();
  });
  it.each([
    '?from=2026-02-30',
    '?from=2026-10-09&to=2026-10-09',
    '?from=2026-10-10&to=2026-10-09',
    '?from=2026-01-01&to=2026-03-01',
    '?page=0',
    '?page=10001',
    '?page=1&page=2',
    '?status=scheduled',
  ])('rejects invalid date search %s', async (path) => {
    expect((await request(path)).status).toBe(400);
    expect(queries.listAppointments).not.toHaveBeenCalled();
  });
  it('validates IDs before accessing records', async () => {
    expect((await request('/invalid')).status).toBe(400);
    expect(queries.findAppointment).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized requests', async () => {
    for (const [body, status] of [
      ['{broken', 400],
      [JSON.stringify({ ...input, notes: 'x'.repeat(9000) }), 413],
    ] as const) {
      const response = await app.request(
        `${origin}/api/appointments`,
        {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body,
        },
        env,
      );
      expect(response.status).toBe(status);
    }
  });
  it('uses Manila dates and UTC instants across midnight/week boundaries', () => {
    expect(clinicDate(new Date('2026-10-08T16:30:00Z'))).toBe('2026-10-09');
    expect(clinicDateTime('2026-10-08T16:30:00Z')).toBe('2026-10-09T00:30');
    expect(clinicInputToUtc('2026-10-09T00:30')).toBe(
      '2026-10-08T16:30:00.000Z',
    );
    expect(clinicDayStart('2026-10-09')).toBe('2026-10-08T16:00:00.000Z');
    expect(clinicWeekStart('2026-10-11')).toBe('2026-10-05');
    expect(addClinicDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(
      parseAppointmentSearch(
        new URLSearchParams('from=2026-10-09&to=2026-10-16&page=2'),
      ),
    ).toEqual({ from: '2026-10-09', to: '2026-10-16', page: 2 });
  });
});
