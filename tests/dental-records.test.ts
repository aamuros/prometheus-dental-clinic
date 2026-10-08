import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker/app';
import * as queries from '../worker/features/dental-records/queries';
import {
  parseDentalRecord,
  parseRecordPage,
} from '../worker/features/dental-records/validation';
import { isFdiTooth } from '../shared/dental-records';
import { addClinicDays, clinicDate } from '../shared/appointments';

const state = vi.hoisted(() => ({ role: 'staff' as string | null }));
vi.mock('../worker/features/auth/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        state.role
          ? {
              user: {
                id: 'actor-id',
                name: 'Synthetic dentist',
                email: 'dentist@example.test',
                role: state.role,
              },
            }
          : null,
    },
  }),
}));
vi.mock('../worker/db/client', () => ({ createDatabase: vi.fn(() => ({})) }));
vi.mock(
  '../worker/features/dental-records/queries',
  async (importOriginal) => ({
    ...(await importOriginal<typeof queries>()),
    isClinicalUser: vi.fn(),
    listDentalRecords: vi.fn(),
    dentalRecordDetails: vi.fn(),
    createDentalRecord: vi.fn(),
    updateDentalRecord: vi.fn(),
    recordAppointments: vi.fn(),
  }),
);
const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
const origin = 'https://clinic.example.test';
const input = {
  patientId: id,
  kind: 'note' as const,
  clinicalNotes: 'Synthetic examination',
  diagnosis: 'Synthetic diagnosis',
  procedures: null,
  toothNumbers: [11, 26, 51],
  treatmentDate: '2026-10-01',
  dentistId: 'dentist-id',
  appointmentId: null,
};
const record = {
  ...input,
  id,
  version: 1,
  dentistName: 'Synthetic dentist',
  createdBy: 'actor-id',
  updatedBy: 'actor-id',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};
function request(
  path = '',
  method = 'GET',
  body?: unknown,
  requestOrigin: string | null = origin,
) {
  return app.request(
    `${origin}/api/dental-records${path}`,
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
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(queries.isClinicalUser).mockResolvedValue(true);
  vi.mocked(queries.createDentalRecord).mockResolvedValue(record);
  vi.mocked(queries.updateDentalRecord).mockResolvedValue({
    ...record,
    version: 2,
  });
  vi.mocked(queries.listDentalRecords).mockResolvedValue({
    records: [record],
    page: 1,
    hasMore: false,
  });
  vi.mocked(queries.dentalRecordDetails).mockResolvedValue({
    record: {
      ...record,
      version: 2,
      clinicalNotes: 'Corrected notes',
      updatedBy: 'second-dentist',
    },
    history: [
      {
        version: 2,
        snapshot: { ...input, clinicalNotes: 'Corrected notes' },
        changedBy: 'second-dentist',
        changedByName: 'Second dentist',
        dentistName: 'Synthetic dentist',
        changedAt: record.updatedAt,
      },
      {
        version: 1,
        snapshot: input,
        changedBy: 'actor-id',
        changedByName: 'Synthetic dentist',
        dentistName: 'Synthetic dentist',
        changedAt: record.createdAt,
      },
    ],
    page: 1,
    hasMore: false,
  });
});
describe('Clinical validation', () => {
  it('accepts notes and completed treatments including primary/permanent FDI teeth', () => {
    expect(parseDentalRecord(input)).toEqual(input);
    expect(
      parseDentalRecord({
        ...input,
        kind: 'treatment',
        clinicalNotes: null,
        procedures: 'Synthetic restoration',
      }),
    ).toMatchObject({ kind: 'treatment', procedures: 'Synthetic restoration' });
    expect(
      parseDentalRecord({ ...input, diagnosis: '  diagnosis  ' }),
    ).toMatchObject({ diagnosis: 'diagnosis' });
    for (const tooth of [
      11, 18, 21, 28, 31, 38, 41, 48, 51, 55, 61, 65, 71, 75, 81, 85,
    ])
      expect(isFdiTooth(tooth)).toBe(true);
  });
  it.each([
    { kind: 'plan' },
    { patientId: 'invalid' },
    { dentistId: 'bad/id' },
    { appointmentId: 'invalid' },
    { treatmentDate: '2026-02-30' },
    { treatmentDate: '0000-01-01' },
    { treatmentDate: addClinicDays(clinicDate(), 1) },
    { clinicalNotes: ' ' },
    { clinicalNotes: 'x'.repeat(4001) },
    { clinicalNotes: 'private\u0000note' },
    { diagnosis: 42 },
    { diagnosis: 'x'.repeat(2001) },
    { procedures: 'x'.repeat(2001) },
    { kind: 'treatment', procedures: null },
    { toothNumbers: [19] },
    { toothNumbers: [56] },
    { toothNumbers: [10] },
    { toothNumbers: [11.5] },
    { toothNumbers: ['11'] },
    { toothNumbers: [11, 11] },
    { createdBy: 'spoofed' },
    { updatedBy: 'spoofed' },
    { version: 1 },
  ])('rejects invalid or forged fields %j', (patch) => {
    expect(parseDentalRecord({ ...input, ...patch })).toBeNull();
  });
  it('requires an integer expected version for edits', () => {
    expect(parseDentalRecord({ ...input, version: 1 }, true)?.version).toBe(1);
    for (const version of [undefined, 0, -1, 1.5, '1', 2147483647])
      expect(parseDentalRecord({ ...input, version }, true)).toBeNull();
  });
  it('rejects unknown/repeated filters and invalid pagination', () => {
    for (const query of [
      'patientId=' + id + '&page=0',
      'patientId=' + id + '&page=1.5',
      'patientId=' + id + '&page=10001',
      'patientId=' + id + '&kind=plan',
      'patientId=' + id + '&kind=note&kind=treatment',
      'patientId=' + id + '&unknown=1',
      'patientId=invalid',
    ])
      expect(parseRecordPage(new URLSearchParams(query), true)).toBeNull();
  });
});
describe('Clinical API', () => {
  it('creates with the server session actor and returns a private uncached response', async () => {
    const response = await request('', 'POST', input);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      record: { ...input, createdBy: 'actor-id', version: 1 },
    });
    expect(queries.createDentalRecord).toHaveBeenCalledWith(
      {},
      input,
      'actor-id',
    );
  });
  it('retrieves patient-filtered notes and treatment history with pagination', async () => {
    const response = await request(`?patientId=${id}&kind=treatment&page=2`);
    expect(response.status).toBe(200);
    expect(queries.listDentalRecords).toHaveBeenCalledWith(
      {},
      id,
      'treatment',
      2,
    );
  });
  it('returns preserved before/after content, authors and revision order', async () => {
    const response = await request(`/${id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      record: {
        version: 2,
        clinicalNotes: 'Corrected notes',
        updatedBy: 'second-dentist',
      },
      history: [
        {
          version: 2,
          snapshot: { clinicalNotes: 'Corrected notes' },
          changedBy: 'second-dentist',
        },
        {
          version: 1,
          snapshot: { clinicalNotes: input.clinicalNotes },
          changedBy: 'actor-id',
        },
      ],
    });
  });
  it('passes the expected version and authenticated modifier to the edit', async () => {
    expect(
      (await request(`/${id}`, 'PUT', { ...input, version: 1 })).status,
    ).toBe(200);
    expect(queries.updateDentalRecord).toHaveBeenCalledWith(
      {},
      id,
      input,
      1,
      'actor-id',
    );
  });
  it('returns a conflict for stale concurrent edits', async () => {
    vi.mocked(queries.updateDentalRecord).mockRejectedValue(
      new queries.DentalRecordError(
        409,
        'This record has changed. Reload the details before saving.',
      ),
    );
    expect(
      (await request(`/${id}`, 'PUT', { ...input, version: 1 })).status,
    ).toBe(409);
  });
  it.each(['staff', 'admin'])(
    'denies non-clinical %s on every read and write',
    async (role) => {
      state.role = role;
      vi.mocked(queries.isClinicalUser).mockResolvedValue(false);
      for (const [path, method, body] of [
        ['?patientId=' + id, 'GET', undefined],
        ['/' + id, 'GET', undefined],
        ['/options?patientId=' + id, 'GET', undefined],
        ['', 'POST', input],
        ['/' + id, 'PUT', { ...input, version: 1 }],
        ['/' + id, 'DELETE', undefined],
      ] as const)
        expect((await request(path, method, body)).status).toBe(403);
      expect(queries.listDentalRecords).not.toHaveBeenCalled();
      expect(queries.dentalRecordDetails).not.toHaveBeenCalled();
      expect(queries.createDentalRecord).not.toHaveBeenCalled();
      expect(queries.updateDentalRecord).not.toHaveBeenCalled();
    },
  );
  it('denies anonymous sessions and unsupported roles before querying clinical access', async () => {
    for (const role of [null, 'visitor']) {
      state.role = role;
      expect((await request('/' + id)).status).toBe(role === null ? 401 : 403);
    }
    expect(queries.isClinicalUser).not.toHaveBeenCalled();
  });
  it('rejects untrusted or missing origins, malformed JSON and oversized requests', async () => {
    expect((await request('', 'POST', input, null)).status).toBe(403);
    expect(
      (await request('', 'POST', input, 'https://attacker.test')).status,
    ).toBe(403);
    expect(
      (
        await request('', 'POST', {
          ...input,
          clinicalNotes: 'x'.repeat(33000),
        })
      ).status,
    ).toBe(413);
    expect(
      (await request('', 'POST', { ...input, createdBy: 'spoof' })).status,
    ).toBe(400);
    expect(
      (await request('/invalid', 'PUT', { ...input, version: 1 })).status,
    ).toBe(400);
    expect(queries.createDentalRecord).not.toHaveBeenCalled();
  });
  it('has no deletion or revision mutation endpoint', async () => {
    const response = await request('/' + id, 'DELETE');
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD, PUT');
    expect((await request('/' + id + '/history', 'PUT', {})).status).toBe(404);
  });
  it('reports not found, invalid references and unexpected errors safely', async () => {
    vi.mocked(queries.dentalRecordDetails).mockRejectedValue(
      new queries.DentalRecordError(404, 'Dental record not found'),
    );
    expect((await request('/' + id)).status).toBe(404);
    vi.mocked(queries.createDentalRecord).mockRejectedValue(
      new queries.DentalRecordError(400, 'Choose an active patient'),
    );
    expect((await request('', 'POST', input)).status).toBe(400);
    vi.mocked(queries.createDentalRecord).mockRejectedValue(
      new Error('secret private notes'),
    );
    const response = await request('', 'POST', input);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
