import { createRoute, redirect } from '@tanstack/react-router';
import { CreateAccountForm } from '../features/auth/create-account-form';
import { loadSchedulingStaff } from '../features/appointments/api';
import { DentistSettings } from '../features/appointments/dentist-settings';
import { loadStaffAccounts } from '../features/staff/api';
import { StaffAccounts } from '../features/staff/staff-accounts';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/staff',
  validateSearch: (search: Record<string, unknown>) => {
    const page = Number(search.page ?? 1);
    return {
      page: Number.isSafeInteger(page) && page >= 1 && page <= 99999 ? page : 1,
    };
  },
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== 'admin') throw redirect({ to: '/' });
  },
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ deps, abortController }) => {
    const [staff, list] = await Promise.all([
      loadSchedulingStaff(abortController.signal),
      loadStaffAccounts(deps.page, abortController.signal),
    ]);
    return { staff, list };
  },
  pendingComponent: () => <p role="status">Loading staff accounts…</p>,
  pendingMs: 0,
  component: StaffPage,
});

export function StaffPage() {
  const { staff, list } = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  return (
    <>
      <CreateAccountForm />
      <DentistSettings staff={staff} />
      <StaffAccounts key={list.page} list={list} actorId={session.user.id} />
    </>
  );
}
