import { createRoute } from '@tanstack/react-router';
import { loadAppointment, loadDentists } from '../features/appointments/api';
import { AppointmentForm } from '../features/appointments/appointment-form';
import { loadPatients } from '../features/patients/api';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/appointments/$appointmentId/edit',
  loader: async ({ params, abortController }) => {
    const [appointment, patients, dentists] = await Promise.all([
      loadAppointment(params.appointmentId, abortController.signal),
      loadPatients(
        { q: '', page: 1, status: 'active' },
        abortController.signal,
      ),
      loadDentists(abortController.signal),
    ]);
    return { appointment, patients, dentists };
  },
  component: EditAppointmentPage,
});
export function EditAppointmentPage() {
  const data = Route.useLoaderData();
  return <AppointmentForm key={data.appointment.id} {...data} />;
}
