import { redirect } from '@tanstack/react-router';
import type { StaffRole } from '../../../shared/auth';

export type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  isDentist: boolean;
  passwordChangeRequired: boolean;
};
export type StaffList = {
  accounts: StaffAccount[];
  page: number;
  hasMore: boolean;
};
export type StaffAction =
  'deactivate' | 'reactivate' | 'revoke-sessions' | 'recover-password';
export class StaffApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = 'Unable to complete the request. Please try again.';
    if (response.status === 400) {
      const data: unknown = await response.json().catch(() => null);
      message =
        object(data) && data.error === 'Password verification failed'
          ? 'Current password is incorrect.'
          : 'Check the details and try again.';
    }
    if (response.status === 403)
      message =
        'Access denied. Check your administrator access or sign in again.';
    if (response.status === 404)
      message = 'This account is no longer available. Refresh the list.';
    if (response.status === 409)
      message =
        'Account changed or the last administrator must retain access. Refresh and try again.';
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      message =
        Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 3600
          ? `Too many attempts. Try again in ${seconds} seconds.`
          : 'Too many attempts. Try again later.';
    }
    throw new StaffApiError(response.status, message);
  }
  return response.json();
}
function readAccount(value: unknown): StaffAccount {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    (value.role !== 'staff' && value.role !== 'admin') ||
    typeof value.active !== 'boolean' ||
    typeof value.isDentist !== 'boolean' ||
    typeof value.passwordChangeRequired !== 'boolean'
  )
    throw new Error('Invalid staff account');
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    active: value.active,
    isDentist: value.isDentist,
    passwordChangeRequired: value.passwordChangeRequired,
  };
}
export async function loadStaffAccounts(
  page: number,
  signal: AbortSignal,
): Promise<StaffList> {
  try {
    const data = await request(`/api/staff?page=${page}`, { signal });
    if (
      !object(data) ||
      !Array.isArray(data.accounts) ||
      data.page !== page ||
      typeof data.hasMore !== 'boolean'
    )
      throw new Error('Invalid staff list');
    return {
      accounts: data.accounts.map(readAccount),
      page,
      hasMore: data.hasMore,
    };
  } catch (error) {
    if (error instanceof StaffApiError && error.status === 401)
      throw redirect({ to: '/login' });
    if (error instanceof StaffApiError && error.status === 403)
      throw redirect({ to: '/' });
    throw error;
  }
}
export async function changePassword(details: {
  currentPassword: string;
  newPassword: string;
}) {
  await mutate('/api/staff/password', details);
}
export async function manageStaff(
  id: string,
  action: StaffAction,
  details:
    | { currentPassword: string; newPassword: string }
    | Record<string, never> = {},
) {
  await mutate(`/api/staff/${encodeURIComponent(id)}/${action}`, details);
}
async function mutate(path: string, body: unknown) {
  const data = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!object(data) || data.success !== true)
    throw new Error('Invalid staff response');
}
