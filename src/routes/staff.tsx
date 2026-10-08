import { createRoute, redirect } from '@tanstack/react-router';
import { CreateAccountForm } from '../features/auth/create-account-form';
import { loadSchedulingStaff } from '../features/appointments/api';
import { DentistSettings } from '../features/appointments/dentist-settings';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/staff',
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== 'admin') throw redirect({ to: '/' });
  },
  loader: ({ abortController }) => loadSchedulingStaff(abortController.signal),
  component: StaffPage,
});

export function StaffPage() {
  return (
    <>
      <CreateAccountForm />
      <DentistSettings staff={Route.useLoaderData()} />
    </>
  );
}
