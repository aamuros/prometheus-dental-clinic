// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../src/app/router';
import { RouteError } from '../src/components/route-error';
import { app } from '../worker/app';

function renderApp(path = '/') {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      path === '/api/session'
        ? Promise.resolve(
            Response.json({
              user: {
                id: 'staff-id',
                name: 'Clinic staff',
                email: 'staff@example.test',
                role: 'staff',
              },
            }),
          )
        : app.request(path),
    ),
  );
});

describe('React application', () => {
  it('renders the home page using the real API contract', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'Application ready' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('API connected');
    expect(fetch).toHaveBeenCalledWith('/api/health');
  });

  it('shows not-found handling for an unknown client route', async () => {
    renderApp('/missing');
    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('redirects an anonymous home visit to login before loading application data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: 'Authentication required' }, { status: 401 }),
        ),
      ),
    );
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
    expect(fetch).not.toHaveBeenCalledWith('/api/health');
  });

  it('keeps staff out of the administrator page', async () => {
    renderApp('/staff');
    expect(
      await screen.findByRole('heading', { name: 'Application ready' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Create staff account' }),
    ).not.toBeInTheDocument();
  });

  it('allows an administrator to open account creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          Response.json(
            path === '/api/appointments/staff'
              ? { staff: [] }
              : {
                  user: {
                    id: 'admin-id',
                    name: 'Admin',
                    email: 'admin@example.test',
                    role: 'admin',
                  },
                },
          ),
        ),
      ),
    );
    renderApp('/staff');
    expect(
      await screen.findByRole('heading', { name: 'Create staff account' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Role')).toHaveValue('staff');
  });

  it.each([
    [
      'failed request',
      () => Promise.resolve(new Response('private details', { status: 500 })),
    ],
    [
      'invalid contract',
      () => Promise.resolve(Response.json({ status: 'unexpected' })),
    ],
    [
      'network failure',
      () => Promise.reject(new Error('private network details')),
    ],
  ])('shows a safe error boundary for a %s', async (_name, fetchResponse) => {
    vi.stubGlobal('fetch', vi.fn(fetchResponse));
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeVisible();
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });

  it('catches component rendering errors', async () => {
    const root = createRootRoute({ errorComponent: RouteError });
    const broken = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => {
        throw new Error('private rendering details');
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([broken]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });
});
