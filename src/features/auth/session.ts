import { redirect } from '@tanstack/react-router';
import type { StaffSession } from '../../../shared/auth';

export async function loadStaffSession(): Promise<StaffSession> {
  const response = await fetch('/api/session');
  if (response.status === 401) throw redirect({ to: '/login' });
  if (!response.ok) throw new Error('Unable to load session');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('user' in data) ||
    !data.user ||
    typeof data.user !== 'object'
  ) {
    throw new Error('Invalid session');
  }
  const user = data.user;
  if (
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('name' in user) ||
    typeof user.name !== 'string' ||
    !('email' in user) ||
    typeof user.email !== 'string' ||
    !('role' in user) ||
    (user.role !== 'admin' && user.role !== 'staff')
  ) {
    throw new Error('Invalid session');
  }
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}
