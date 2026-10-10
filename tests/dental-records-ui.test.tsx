// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../src/app/router';
import type { DentalRecord } from '../shared/dental-records';

const patientId = '36f38e10-ae56-4a44-9fae-5742baceb003';
const recordId = '56f38e10-ae56-4a44-9fae-5742baceb003';
let records: DentalRecord[];
let clinical: boolean;
let saveStatus: number;
let archived: boolean;
const requests: { method: string; body: unknown }[] = [];
const original: DentalRecord = {
  id: recordId,
  patientId,
  kind: 'note',
  clinicalNotes: 'Original note',
  diagnosis: 'Synthetic diagnosis',
  procedures: null,
  toothNumbers: [11],
  treatmentDate: '2026-10-01',
  dentistId: 'dentist-id',
  dentistName: 'Synthetic dentist',
  appointmentId: null,
  version: 1,
  createdBy: 'dentist-id',
  updatedBy: 'dentist-id',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
function renderPage(kind = 'note') {
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [
        `/patients/${patientId}/dental-records?kind=${kind}&page=1`,
      ],
    }),
  );
  return render(<RouterProvider router={router} />);
}
beforeEach(() => {
  records = [{ ...original }];
  clinical = true;
  saveStatus = 200;
  archived = false;
  requests.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session')
        return Response.json({
          user: {
            id: 'dentist-id',
            name: 'Synthetic dentist',
            email: 'dentist@example.test',
            role: 'staff',
          },
        });
      if (path.startsWith('/api/patients/'))
        return Response.json({
          patient: {
            id: patientId,
            name: 'Synthetic Patient',
            birthDate: '1990-05-17',
            contactNumber: '09170000000',
            email: null,
            createdAt: original.createdAt,
            updatedAt: original.updatedAt,
            archivedAt: archived ? original.updatedAt : null,
          },
        });
      if (!clinical)
        return Response.json(
          { error: 'Clinical dentist access required' },
          { status: 403 },
        );
      if (path.startsWith('/api/dental-records/options'))
        return Response.json({
          dentists: [{ id: 'dentist-id', name: 'Synthetic dentist' }],
          appointments: [],
        });
      if (init?.method === 'POST' || init?.method === 'PUT') {
        const body: unknown = JSON.parse(String(init.body));
        requests.push({ method: init.method, body });
        if (saveStatus === 409)
          return Response.json(
            {
              error:
                'This record has changed. Reload the details before saving.',
            },
            { status: 409 },
          );
        if (saveStatus === 403)
          return Response.json(
            { error: 'Clinical dentist access required' },
            { status: 403 },
          );
        if (!body || typeof body !== 'object')
          throw new Error('Invalid fixture');
        const updated = {
          ...original,
          ...body,
          version: init.method === 'PUT' ? 2 : 1,
        };
        records = [updated];
        return Response.json(
          { record: updated },
          { status: init.method === 'POST' ? 201 : 200 },
        );
      }
      if (path.startsWith('/api/dental-records?')) {
        const kind = new URL(path, 'http://localhost').searchParams.get('kind');
        return Response.json({
          records: records.filter((record) => record.kind === kind),
          page: 1,
          hasMore: false,
        });
      }
      const record = records[0];
      return Response.json({
        record,
        history: [
          {
            version: record?.version,
            snapshot: record,
            changedBy: 'dentist-id',
            changedByName: 'Synthetic dentist',
            dentistName: 'Synthetic dentist',
            changedAt: original.createdAt,
          },
          ...(record?.version === 2
            ? [
                {
                  version: 1,
                  snapshot: original,
                  changedBy: 'dentist-id',
                  changedByName: 'Synthetic dentist',
                  dentistName: 'Synthetic dentist',
                  changedAt: original.createdAt,
                },
              ]
            : []),
        ],
        page: 1,
        hasMore: false,
      });
    }),
  );
});
describe('Dental records UI', () => {
  it('denies non-clinical staff without rendering clinical content or forms', async () => {
    clinical = false;
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clinical dentist access',
    );
    expect(screen.queryByText('Original note')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add clinical note' }),
    ).not.toBeInTheDocument();
  });
  it('shows record details and prior revision content after an edit', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /View record details/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Record details' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit clinical record' }),
    );
    const notes = await screen.findByLabelText('Clinical notes');
    fireEvent.change(notes, { target: { value: 'Corrected note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      body: { version: 1, clinicalNotes: 'Corrected note', patientId },
    });
    expect(
      await screen.findByText(/Version 2 · Synthetic dentist/),
    ).toBeVisible();
    expect(screen.getByText(/Version 1 · Synthetic dentist/)).toBeVisible();
  });
  it('records completed treatment and navigates to treatment history', async () => {
    records = [];
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record completed treatment' }),
    );
    fireEvent.change(await screen.findByLabelText('Procedures performed'), {
      target: { value: 'Synthetic restoration' },
    });
    fireEvent.change(screen.getByLabelText('Tooth numbers (FDI, optional)'), {
      target: { value: '26, 51' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: 'POST',
      body: {
        kind: 'treatment',
        procedures: 'Synthetic restoration',
        toothNumbers: [26, 51],
        dentistId: 'dentist-id',
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Treatment history' }),
    ).toBeVisible();
  });
  it('rejects invalid FDI teeth without sending a request', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add clinical note' }),
    );
    fireEvent.change(await screen.findByLabelText('Clinical notes'), {
      target: { value: 'Synthetic note' },
    });
    fireEvent.change(screen.getByLabelText('Tooth numbers (FDI, optional)'), {
      target: { value: '19' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use distinct FDI',
    );
    expect(requests).toHaveLength(0);
  });
  it('preserves form input when another dentist has edited the record', async () => {
    saveStatus = 409;
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /View record details/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit clinical record' }),
    );
    fireEvent.change(await screen.findByLabelText('Clinical notes'), {
      target: { value: 'Unsaved correction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This record has changed',
    );
    expect(screen.getByLabelText('Clinical notes')).toHaveValue(
      'Unsaved correction',
    );
  });
  it('clears clinical content and unsaved input when clinical access is revoked', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /View record details/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit clinical record' }),
    );
    fireEvent.change(await screen.findByLabelText('Clinical notes'), {
      target: { value: 'Unsaved private correction' },
    });
    clinical = false;
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clinical dentist access',
    );
    expect(screen.queryByLabelText('Clinical notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Original note')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Unsaved private correction'),
    ).not.toBeInTheDocument();
  });

  it('retains an older appointment link when correcting archived clinical history', async () => {
    archived = true;
    const appointmentId = '76f38e10-ae56-4a44-9fae-5742baceb003';
    records = [{ ...original, appointmentId }];
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /View record details/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit clinical record' }),
    );
    fireEvent.change(await screen.findByLabelText('Clinical notes'), {
      target: { value: 'Archived correction' },
    });
    expect(screen.getByLabelText('Recent appointment (optional)')).toHaveValue(
      appointmentId,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      body: { appointmentId, clinicalNotes: 'Archived correction', version: 1 },
    });
    expect(
      await screen.findByText(/Version 2 · Synthetic dentist/),
    ).toBeVisible();
  });
  it('allows viewing archived history while hiding new-entry controls and all deletion controls', async () => {
    archived = true;
    renderPage();
    expect(await screen.findByText('Original note')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add clinical note' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument();
  });
});
