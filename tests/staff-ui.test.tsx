// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../src/app/router';

// Better Auth captures fetch when its client is created. Keep the real client,
// but defer its transport to this test's fetch stub (never make network calls).
vi.mock('../src/features/auth/client', async () => {
  const { createAuthClient } = await import('better-auth/react');
  return {
    authClient: createAuthClient({
      fetchOptions: {
        customFetchImpl: (input, init) =>
          fetch(new URL(String(input), window.location.origin).pathname, init),
      },
    }),
  };
});

const employee = {
  id: 'employee',
  name: 'Employee',
  email: 'employee@example.test',
  role: 'staff',
  active: true,
  isDentist: true,
  passwordChangeRequired: false,
};
let role: 'admin' | 'staff';
let required: boolean;
let account: typeof employee;
let status: number;
let requests: { path: string; body: unknown }[];
let release: (() => void) | undefined;
let hold: boolean;
function renderPage(path = '/staff') {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(<RouterProvider router={router} />);
  return router;
}
function fillPasswords(recovery = false) {
  fireEvent.change(
    screen.getByLabelText(
      recovery ? 'Your administrator password' : 'Current password',
    ),
    { target: { value: 'current-password' } },
  );
  fireEvent.change(
    screen.getByLabelText(recovery ? 'Temporary password' : 'New password'),
    { target: { value: 'replacement-password' } },
  );
  fireEvent.change(
    screen.getByLabelText(
      recovery ? 'Confirm temporary password' : 'Confirm new password',
    ),
    { target: { value: 'replacement-password' } },
  );
}
beforeEach(() => {
  role = 'admin';
  required = false;
  account = { ...employee };
  status = 200;
  requests = [];
  hold = false;
  release = undefined;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session')
        return Response.json({
          user: {
            id: 'actor',
            name: 'Actor',
            email: 'actor@example.test',
            role,
            passwordChangeRequired: required,
          },
        });
      if (path === '/api/health') return Response.json({ status: 'ok' });
      if (path === '/api/appointments/staff')
        return Response.json({
          staff: [
            {
              id: employee.id,
              name: employee.name,
              isDentist: account.isDentist,
            },
          ],
        });
      if (path.startsWith('/api/staff?')) {
        const page = Number(
          new URL(path, 'https://example.test').searchParams.get('page'),
        );
        return Response.json({
          accounts:
            page === 1
              ? [account]
              : [{ ...account, id: 'second', name: 'Second employee' }],
          page,
          hasMore: page === 1,
        });
      }
      if (init?.method === 'POST') {
        requests.push({
          path,
          body: JSON.parse(String(init.body ?? '{}')) as unknown,
        });
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (status !== 200)
          return Response.json(
            { error: 'private provider details' },
            { status, headers: { 'Retry-After': '60' } },
          );
        if (path.endsWith('/deactivate')) account.active = false;
        if (path.endsWith('/reactivate')) account.active = true;
        if (path.endsWith('/recover-password'))
          account.passwordChangeRequired = true;
        return Response.json({ success: true });
      }
      throw new Error('Unexpected request');
    }),
  );
});

describe('staff account management', () => {
  it('keeps management and its API unavailable to staff', async () => {
    role = 'staff';
    renderPage();
    await screen.findByRole('heading', { name: 'Application ready' });
    expect(
      screen.queryByRole('heading', { name: 'Staff accounts' }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([path]) => String(path).startsWith('/api/staff')),
    ).toBe(false);
  });
  it('lists statuses and paginates on the server while retaining creation and dentist settings', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Staff accounts' });
    expect(
      screen.getByRole('heading', { name: 'Create staff account' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Dentists for scheduling' }),
    ).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Next page' }));
    expect(await screen.findByText('Second employee')).toBeVisible();
    expect(screen.getByText('Page 2')).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Previous page' }));
    expect(await screen.findByText('Employee')).toBeVisible();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([path]) => path === '/api/staff?page=2'),
    ).toBe(true);
  });
  it.each(['Deactivate', 'Revoke sessions'] as const)(
    'confirms %s, supports cancellation and submits once',
    async (action) => {
      renderPage();
      fireEvent.click(
        await screen.findByRole('button', { name: `${action} for Employee` }),
      );
      const form = screen.getByRole('form', { name: `${action}: Employee` });
      expect(
        within(form).getByRole('button', { name: 'Cancel' }),
      ).toHaveFocus();
      fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
      expect(requests).toHaveLength(0);
      fireEvent.click(
        screen.getByRole('button', { name: `${action} for Employee` }),
      );
      hold = true;
      const confirm = screen.getByRole('form', { name: `${action}: Employee` });
      fireEvent.submit(confirm);
      fireEvent.submit(confirm);
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      release?.();
      expect(await screen.findByRole('status')).toHaveTextContent(/completed/i);
      expect(requests[0]).toEqual({
        path: `/api/staff/employee/${action === 'Deactivate' ? 'deactivate' : 'revoke-sessions'}`,
        body: {},
      });
      if (action === 'Deactivate') {
        expect(screen.getByText('Inactive')).toBeVisible();
        fireEvent.click(
          screen.getByRole('button', { name: 'Reactivate for Employee' }),
        );
        hold = false;
        fireEvent.submit(
          screen.getByRole('form', { name: 'Reactivate: Employee' }),
        );
        await waitFor(() => expect(screen.getByText('Active')).toBeVisible());
      }
    },
  );
  it('recovers an employee using the administrator password and clears credentials', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recover password for Employee',
      }),
    );
    fillPasswords(true);
    const form = screen.getByRole('form', {
      name: 'Recover password: Employee',
    });
    expect(within(form).getByRole('checkbox')).toBeRequired();
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.submit(form);
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Temporary password'),
      ).not.toBeInTheDocument(),
    );
    expect(requests[0]).toEqual({
      path: '/api/staff/employee/recover-password',
      body: {
        currentPassword: 'current-password',
        newPassword: 'replacement-password',
      },
    });
    expect(screen.getByText('Password change required')).toBeVisible();
  });
  it.each([400, 403, 404, 409, 429, 500])(
    'handles mutation failure %s safely',
    async (code) => {
      status = code;
      renderPage();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Revoke sessions for Employee',
        }),
      );
      fireEvent.submit(
        screen.getByRole('form', { name: 'Revoke sessions: Employee' }),
      );
      expect(await screen.findByRole('alert')).not.toHaveTextContent(
        'private provider details',
      );
      expect(
        screen.getByRole('button', { name: 'Confirm Revoke sessions' }),
      ).toBeEnabled();
      if (code === 429)
        expect(screen.getByRole('alert')).toHaveTextContent('60 seconds');
    },
  );
  it('returns to login when a mutation discovers a revoked session', async () => {
    status = 401;
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deactivate for Employee' }),
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Deactivate: Employee' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
  });
});

describe('password change and mandatory recovery', () => {
  it.each(['/', '/staff', '/patients', '/appointments', '/change-password'])(
    'restricts a recovered account at %s before business requests',
    async (path) => {
      required = true;
      const router = renderPage(path);
      expect(
        await screen.findByRole('heading', { name: 'Change password' }),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe('/change-password');
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
      expect(
        screen.queryByRole('link', { name: 'Patients' }),
      ).not.toBeInTheDocument();
      expect(
        vi.mocked(fetch).mock.calls.every(([url]) => url === '/api/session'),
      ).toBe(true);
    },
  );
  it.each(['staff', 'admin'] as const)(
    'allows %s to replace their password once and returns to login',
    async (userRole) => {
      role = userRole;
      hold = true;
      renderPage('/change-password');
      await screen.findByRole('heading', { name: 'Change password' });
      fillPasswords();
      const current = screen.getByLabelText('Current password');
      const form = screen.getByRole('form', { name: 'Change password' });
      fireEvent.submit(form);
      fireEvent.submit(form);
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(screen.getByRole('button', { name: 'Changing…' })).toBeDisabled();
      release?.();
      expect(
        await screen.findByRole('heading', { name: 'Staff login' }),
      ).toBeVisible();
      expect(current).toHaveValue('');
      expect(screen.getByRole('status')).toHaveTextContent(/password changed/i);
      expect(requests[0]).toEqual({
        path: '/api/staff/password',
        body: {
          currentPassword: 'current-password',
          newPassword: 'replacement-password',
        },
      });
    },
  );
  it.each([
    ['New password', 'short', /12.*128/],
    ['New password', 'x'.repeat(129), /12.*128/],
    ['Confirm new password', 'mismatch-password', /match/],
    ['Current password', 'replacement-password', /different/],
  ])('validates %s before submitting', async (label, value, message) => {
    renderPage('/change-password');
    await screen.findByRole('heading', { name: 'Change password' });
    fillPasswords();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(requests).toHaveLength(0);
  });
  it.each([400, 403, 409, 429, 500])(
    'handles password error %s and allows retry',
    async (code) => {
      status = code;
      renderPage('/change-password');
      await screen.findByRole('heading', { name: 'Change password' });
      fillPasswords();
      fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('private provider details');
      if (code === 429) expect(alert).toHaveTextContent('60 seconds');
      expect(
        screen.getByRole('button', { name: 'Change password' }),
      ).toBeEnabled();
    },
  );
  it('returns expired sessions to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Expired' }, { status: 401 })),
    );
    renderPage('/change-password');
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
  });
});

describe('session recovery contract', () => {
  it('preserves a required password change', async () => {
    required = true;
    const { loadStaffSession } = await import('../src/features/auth/session');
    expect((await loadStaffSession()).user.passwordChangeRequired).toBe(true);
  });
  it('rejects a malformed recovery flag instead of granting business access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          user: {
            id: 'actor',
            name: 'Actor',
            email: 'actor@example.test',
            role: 'staff',
            passwordChangeRequired: 'true',
          },
        }),
      ),
    );
    const { loadStaffSession } = await import('../src/features/auth/session');
    await expect(loadStaffSession()).rejects.toThrow('Invalid session');
  });
});

describe('staff integration edge cases', () => {
  it('shows listing progress until the server responds', async () => {
    const original = vi.mocked(fetch).getMockImplementation();
    let finish: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path.startsWith('/api/staff?'))
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        if (!original) throw new Error('Missing test transport');
        return original(path, init);
      }),
    );
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loading staff accounts',
    );
    expect(
      screen.queryByRole('button', { name: 'Deactivate for Employee' }),
    ).not.toBeInTheDocument();
    finish?.();
    expect(await screen.findByText('Employee')).toBeVisible();
  });
  it.each([401, 500, 'network', 'malformed'] as const)(
    'handles listing failure %s safely',
    async (failure) => {
      const original = vi.mocked(fetch).getMockImplementation();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string, init?: RequestInit) => {
          if (path.startsWith('/api/staff?')) {
            if (failure === 'network')
              throw new Error('private network details');
            if (failure === 'malformed')
              return Response.json({
                accounts: [{ ...employee, active: 'yes' }],
                page: 1,
                hasMore: false,
              });
            return new Response('private internal details', {
              status: failure,
            });
          }
          if (!original) throw new Error('Missing test transport');
          return original(path, init);
        }),
      );
      renderPage();
      if (failure === 401)
        expect(
          await screen.findByRole('heading', { name: 'Staff login' }),
        ).toBeVisible();
      else
        expect(await screen.findByRole('alert')).not.toHaveTextContent(
          'private',
        );
      expect(
        screen.queryByRole('button', { name: 'Deactivate for Employee' }),
      ).not.toBeInTheDocument();
    },
  );
  it('requires identity verification and matching passwords before recovery', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Recover password for Employee',
      }),
    );
    fillPasswords(true);
    const form = screen.getByRole('form', {
      name: 'Recover password: Employee',
    });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(/identity/);
    fireEvent.click(screen.getByRole('checkbox', { name: /verified/ }));
    fireEvent.change(screen.getByLabelText('Confirm temporary password'), {
      target: { value: 'mismatched-password' },
    });
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(/match/);
    expect(requests).toHaveLength(0);
    fireEvent.keyDown(form, { key: 'Escape' });
    expect(
      screen.queryByLabelText('Temporary password'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Recover password for Employee' }),
    ).toHaveFocus();
  });
  it('uses self-service password change for the administrator’s own account', async () => {
    account.id = 'actor';
    renderPage();
    await screen.findByRole('heading', { name: 'Staff accounts' });
    expect(
      screen.queryByRole('button', { name: 'Recover password for Employee' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Change password' }));
    expect(
      await screen.findByRole('heading', { name: 'Change password' }),
    ).toBeVisible();
  });
  it('returns an administrator to login after revoking their own sessions', async () => {
    account.id = 'actor';
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Revoke sessions for Employee',
      }),
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Revoke sessions: Employee' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
  });
  it('handles an incorrect current password without exposing the backend body', async () => {
    const original = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/api/staff/password')
          return Response.json(
            { error: 'Password verification failed' },
            { status: 400 },
          );
        if (!original) throw new Error('Missing test transport');
        return original(path, init);
      }),
    );
    renderPage('/change-password');
    await screen.findByRole('heading', { name: 'Change password' });
    fillPasswords();
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Current password is incorrect',
    );
  });
  it('returns a revoked password-change session to login', async () => {
    status = 401;
    renderPage('/change-password');
    await screen.findByRole('heading', { name: 'Change password' });
    fillPasswords();
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
  });
  it('routes a recovered employee from login to password replacement', async () => {
    required = true;
    role = 'staff';
    const router = renderPage('/login');
    await screen.findByRole('heading', { name: 'Staff login' });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'employee@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'temporary-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { name: 'Change password' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/change-password');
  });
  it('keeps logout working during mandatory recovery', async () => {
    required = true;
    renderPage('/change-password');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Staff login' }),
    ).toBeVisible();
  });
  it('keeps account creation working and refreshes the staff list', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Create staff account' });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New employee' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.test' },
    });
    const password = screen.getByLabelText('Password');
    fireEvent.change(password, { target: { value: 'new-employee-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Account created',
    );
    expect(password).toHaveValue('');
    expect(requests[0]).toEqual({
      path: '/api/auth/admin/create-user',
      body: {
        name: 'New employee',
        email: 'new@example.test',
        password: 'new-employee-password',
        role: 'staff',
        data: { isDentist: false },
      },
    });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([path]) => path === '/api/staff?page=1').length,
      ).toBeGreaterThan(1),
    );
  });
});

it('keeps recovery restrictions when navigating through the application header', async () => {
  required = true;
  const router = renderPage('/change-password');
  await screen.findByRole('heading', { name: 'Change password' });
  fireEvent.click(screen.getByRole('link', { name: 'Web Application' }));
  await waitFor(() => expect(router.state.status).toBe('idle'));
  expect(router.state.location.pathname).toBe('/change-password');
  expect(
    screen.queryByRole('heading', { name: 'Application ready' }),
  ).not.toBeInTheDocument();
  expect(
    vi.mocked(fetch).mock.calls.every(([path]) => path === '/api/session'),
  ).toBe(true);
});
