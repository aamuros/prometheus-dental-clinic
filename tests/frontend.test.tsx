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
    vi.fn((path: string) => app.request(path)),
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
