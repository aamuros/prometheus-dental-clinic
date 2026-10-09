// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../src/app/router';
import type { Patient } from '../shared/patients';
import { clinicDate } from '../shared/appointments';

const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
const patient: Patient = {
  id,
  name: 'Synthetic Patient',
  birthDate: '1990-05-17',
  contactNumber: '09170000000',
  email: null,
  createdAt: '2026-10-08T00:00:00Z',
  updatedAt: '2026-10-08T00:00:00Z',
  archivedAt: null,
};
let role: 'staff' | 'admin';
let record: Patient;

function renderPage(path: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  role = 'staff';
  record = { ...patient };
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session')
        return Response.json({
          user: {
            id: 'staff-id',
            name: 'Synthetic staff',
            email: 'staff@example.test',
            role,
          },
        });
      if (path.startsWith('/api/patients?'))
        return Response.json({ patients: [record], page: 1, hasMore: false });
      if (path.endsWith('/archive')) {
        record = { ...record, archivedAt: '2026-10-08T01:00:00Z' };
        return Response.json({ patient: record });
      }
      if (init?.method === 'POST' || init?.method === 'PUT')
        return Response.json(
          { patient: record },
          { status: init.method === 'POST' ? 201 : 200 },
        );
      return Response.json({ patient: record });
    }),
  );
});

describe('Patient UI', () => {
  it('lists patients and submits search to the API', async () => {
    renderPage('/patients');
    expect(
      await screen.findByRole('link', { name: patient.name }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search patients'), {
      target: { value: 'Synthetic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/patients?q=Synthetic&page=1&status=active',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it('creates a patient from the form and opens their details', async () => {
    renderPage('/patients/new');
    expect(
      await screen.findByRole('heading', { name: 'Add patient' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Birth date')).toHaveAttribute('max', clinicDate());
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: patient.name },
    });
    fireEvent.change(screen.getByLabelText('Birth date'), {
      target: { value: patient.birthDate },
    });
    fireEvent.change(screen.getByLabelText('Contact number'), {
      target: { value: patient.contactNumber },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save patient' }));
    expect(
      await screen.findByRole('heading', { name: patient.name }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      '/api/patients',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: patient.name,
          birthDate: patient.birthDate,
          contactNumber: patient.contactNumber,
          email: null,
        }),
      }),
    );
  });

  it('loads editable details but hides archive from staff', async () => {
    renderPage(`/patients/${id}/edit`);
    expect(await screen.findByLabelText('Name')).toHaveValue(patient.name);
    fireEvent.change(screen.getByLabelText('Contact number'), {
      target: { value: '09171111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save patient' }));
    expect(
      await screen.findByRole('heading', { name: patient.name }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/patients/${id}`,
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Archive patient' }),
    ).not.toBeInTheDocument();
  });

  it('requires confirmation before an admin archives a patient', async () => {
    role = 'admin';
    renderPage(`/patients/${id}`);
    expect(
      await screen.findByRole('heading', { name: patient.name }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Archive patient' }));
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/patients/${id}/archive`,
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    expect(await screen.findByText('Archived patient')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Edit patient' }),
    ).not.toBeInTheDocument();
  });

  it('shows a validation error and keeps entered data when saving fails', async () => {
    vi.mocked(fetch).mockImplementation(async (path) =>
      path === '/api/session'
        ? Response.json({
            user: {
              id: 'staff',
              name: 'Staff',
              email: 'staff@example.test',
              role,
            },
          })
        : Response.json({ error: 'Invalid patient details' }, { status: 400 }),
    );
    renderPage('/patients/new');
    const name = await screen.findByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Synthetic' } });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save patient' }).closest('form') ??
        name,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check the patient details',
    );
    expect(name).toHaveValue('Synthetic');
  });
});
