import { createRoute } from '@tanstack/react-router';
import { loadDentists } from '../features/appointments/api';
import { AppointmentForm } from '../features/appointments/appointment-form';
import { loadPatients } from '../features/patients/api';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/appointments/new',
  loader: async ({ abortController }) => {
    const [patients, dentists] = await Promise.all([
      loadPatients(
        { q: '', page: 1, status: 'active' },
        abortController.signal,
      ),
      loadDentists(abortController.signal),
    ]);
    return { patients, dentists };
  },
  component: NewAppointmentPage,
});
export function NewAppointmentPage() {
  return <AppointmentForm {...Route.useLoaderData()} />;
}
