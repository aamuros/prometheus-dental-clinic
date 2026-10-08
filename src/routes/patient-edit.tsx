import { createRoute } from '@tanstack/react-router';
import { loadPatient } from '../features/patients/api';
import { PatientForm } from '../features/patients/patient-form';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/patients/$patientId/edit',
  loader: ({ params, abortController }) =>
    loadPatient(params.patientId, abortController.signal),
  component: EditPatientPage,
});

export function EditPatientPage() {
  const patient = Route.useLoaderData();
  return patient.archivedAt ? (
    <p role="status">Archived patients cannot be edited.</p>
  ) : (
    <PatientForm key={patient.id} patient={patient} />
  );
}
