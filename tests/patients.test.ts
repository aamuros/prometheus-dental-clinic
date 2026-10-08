import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker/app';
import * as queries from '../worker/features/patients/queries';
import type { patients } from '../worker/features/patients/schema';
import {
  parsePatient,
  parsePatientSearch,
} from '../worker/features/patients/validation';

const state = vi.hoisted(() => ({ role: 'staff' as string | null }));
vi.mock('../worker/features/auth/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        state.role
          ? {
              user: {
                id: 'staff-user',
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
vi.mock('../worker/features/patients/queries', () => ({
  listPatients: vi.fn(),
  findPatient: vi.fn(),
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
  archivePatient: vi.fn(),
}));

const origin = 'https://clinic.example.test';
const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
const missingId = '36f38e10-ae56-4a44-9fae-5742baceb004';
const input = {
  name: 'Synthetic Patient',
  birthDate: '1990-05-17',
  contactNumber: '+63 917 000 0000',
  email: 'patient@example.test',
};
let records: Map<string, typeof patients.$inferSelect>;

function request(
  path = '',
  method = 'GET',
  body?: unknown,
  requestOrigin: string | null = origin,
) {
  return app.request(
    `${origin}/api/patients${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    {
      DATABASE_URL: 'unused',
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'test-only-secret-at-least-32-characters',
    },
  );
}

beforeEach(() => {
  state.role = 'staff';
  records = new Map();
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(queries.createPatient).mockImplementation(async (_db, data) => {
    const patient = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };
    records.set(id, patient);
    return patient;
  });
  vi.mocked(queries.findPatient).mockImplementation(async (_db, id) =>
    records.get(id),
  );
  vi.mocked(queries.listPatients).mockImplementation(async (_db, search) => ({
    patients: [...records.values()].filter(
      (patient) =>
        (search.status === 'archived') === !!patient.archivedAt &&
        patient.name.toLowerCase().includes(search.q.toLowerCase()),
    ),
    page: search.page,
    hasMore: false,
  }));
  vi.mocked(queries.updatePatient).mockImplementation(async (_db, id, data) => {
    const patient = records.get(id);
    if (!patient || patient.archivedAt) return undefined;
    const updated = { ...patient, ...data, updatedAt: new Date() };
    records.set(id, updated);
    return updated;
  });
  vi.mocked(queries.archivePatient).mockImplementation(async (_db, id) => {
    const patient = records.get(id);
    if (!patient || patient.archivedAt) return undefined;
    const now = new Date();
    const archived = { ...patient, archivedAt: now, updatedAt: now };
    records.set(id, archived);
    return archived;
  });
});

describe('Patient API', () => {
  it.each(['admin', 'staff'])(
    'allows %s to create, search, read and edit patients',
    async (role) => {
      state.role = role;
      const created = await request('', 'POST', {
        ...input,
        name: ` ${input.name} `,
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toEqual({
        patient: expect.objectContaining({
          id,
          name: input.name,
          archivedAt: null,
          createdAt: expect.any(String),
        }),
      });
      const list = await request('?q=synthetic');
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual({
        patients: [expect.objectContaining({ id })],
        page: 1,
        hasMore: false,
      });
      expect((await request(`/${id}`)).status).toBe(200);
      const edited = await request(`/${id}`, 'PUT', {
        ...input,
        name: 'Updated Patient',
        email: '',
      });
      expect(edited.status).toBe(200);
      expect(await edited.json()).toEqual({
        patient: expect.objectContaining({
          name: 'Updated Patient',
          email: null,
        }),
      });
    },
  );

  it('archives without deleting, excludes archived patients by default, and refuses edits', async () => {
    await request('', 'POST', input);
    state.role = 'admin';
    expect((await request(`/${id}/archive`, 'POST')).status).toBe(200);
    const archived = records.get(id)?.archivedAt;
    expect(archived).toBeInstanceOf(Date);
    expect(await (await request()).json()).toEqual({
      patients: [],
      page: 1,
      hasMore: false,
    });
    expect(await (await request('?status=archived')).json()).toEqual({
      patients: [
        expect.objectContaining({ id, archivedAt: expect.any(String) }),
      ],
      page: 1,
      hasMore: false,
    });
    expect((await request(`/${id}`)).status).toBe(200);
    expect((await request(`/${id}`, 'PUT', input)).status).toBe(409);
    expect((await request(`/${id}/archive`, 'POST')).status).toBe(200);
    expect(records.get(id)?.archivedAt).toEqual(archived);
    expect((await request(`/${id}`, 'DELETE')).status).toBe(405);
    expect(records.has(id)).toBe(true);
  });

  it('denies staff archive permission before database mutation', async () => {
    expect((await request(`/${id}/archive`, 'POST')).status).toBe(403);
    expect(queries.archivePatient).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'GET'],
    ['', 'POST'],
    [`/${id}`, 'GET'],
    [`/${id}`, 'PUT'],
    [`/${id}/archive`, 'POST'],
  ])('rejects unauthenticated %s %s before querying', async (path, method) => {
    state.role = null;
    expect(
      (await request(path, method, method === 'GET' ? undefined : input))
        .status,
    ).toBe(401);
    expect(queries.listPatients).not.toHaveBeenCalled();
    expect(queries.findPatient).not.toHaveBeenCalled();
    expect(queries.createPatient).not.toHaveBeenCalled();
    expect(queries.updatePatient).not.toHaveBeenCalled();
    expect(queries.archivePatient).not.toHaveBeenCalled();
  });

  it('denies unsupported roles', async () => {
    state.role = 'owner';
    expect((await request()).status).toBe(403);
    expect(queries.listPatients).not.toHaveBeenCalled();
  });

  it.each([null, 'https://hostile.example.test'])(
    'rejects mutations from origin %s',
    async (requestOrigin) => {
      state.role = 'admin';
      for (const [path, method] of [
        ['', 'POST'],
        [`/${id}`, 'PUT'],
        [`/${id}/archive`, 'POST'],
      ]) {
        expect((await request(path, method, input, requestOrigin)).status).toBe(
          403,
        );
      }
      expect(queries.createPatient).not.toHaveBeenCalled();
      expect(queries.updatePatient).not.toHaveBeenCalled();
      expect(queries.archivePatient).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    [],
    {},
    { ...input, name: ' ' },
    { ...input, name: 'x'.repeat(201) },
    { ...input, name: 'Name\u0000' },
    { ...input, birthDate: '2023-02-29' },
    { ...input, birthDate: '2000-02-30' },
    { ...input, birthDate: '9999-01-01' },
    { ...input, birthDate: '0000-01-01' },
    { ...input, contactNumber: '123' },
    { ...input, contactNumber: '1234567890123456' },
    { ...input, contactNumber: 'call-me' },
    { ...input, email: 'invalid' },
    { ...input, email: 'patient\u0000@example.test' },
    { ...input, email: 1 },
    { ...input, archivedAt: new Date().toISOString() },
    { ...input, id },
  ])('validates patient input %j on create and update', async (body) => {
    expect((await request('', 'POST', body)).status).toBe(400);
    expect((await request(`/${id}`, 'PUT', body)).status).toBe(400);
    expect(queries.createPatient).not.toHaveBeenCalled();
    expect(queries.updatePatient).not.toHaveBeenCalled();
  });

  it('accepts a leap-day birth date and omitted optional email', async () => {
    const body = {
      name: input.name,
      birthDate: '2000-02-29',
      contactNumber: input.contactNumber,
    };
    expect(parsePatient(body)).toEqual({
      ...body,
      birthDate: '2000-02-29',
      email: null,
    });
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    for (const [body, status] of [
      ['{broken', 400],
      [JSON.stringify({ ...input, name: 'x'.repeat(9000) }), 413],
    ] as const) {
      const response = await app.request(
        `${origin}/api/patients`,
        {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body,
        },
        {
          DATABASE_URL: 'unused',
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: 'test-only-secret-at-least-32-characters',
        },
      );
      expect(response.status).toBe(status);
    }
    expect(queries.createPatient).not.toHaveBeenCalled();
  });

  it.each([
    '?page=0',
    '?page=1.5',
    '?page=10001',
    '?status=all',
    '?q=' + 'x'.repeat(101),
    '?page=1&page=2',
    '?unknown=1',
  ])('rejects invalid search %s', async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(queries.listPatients).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs and returns 404 for absent records', async () => {
    state.role = 'admin';
    expect((await request('/invalid')).status).toBe(400);
    expect(queries.findPatient).not.toHaveBeenCalled();
    expect((await request(`/${missingId}`)).status).toBe(404);
    expect((await request(`/${missingId}`, 'PUT', input)).status).toBe(404);
    expect((await request(`/${missingId}/archive`, 'POST')).status).toBe(404);
  });

  it('keeps errors, response caching and logs safe', async () => {
    vi.mocked(queries.listPatients).mockRejectedValueOnce(
      new Error('private patient and database details'),
    );
    const response = await request('?q=Sensitive');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(
      /Sensitive|private/,
    );
  });

  it('preserves bounded search and pagination', () => {
    expect(
      parsePatientSearch(
        new URLSearchParams('q=Patient&page=2&status=archived'),
      ),
    ).toEqual({ q: 'Patient', page: 2, status: 'archived' });
  });
});
