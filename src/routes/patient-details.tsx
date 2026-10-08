import { createRoute } from '@tanstack/react-router';
import { loadPatient } from '../features/patients/api';
import { PatientDetailsPage } from '../features/patients/patient-details';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/patients/$patientId',
  loader: ({ params, abortController }) =>
    loadPatient(params.patientId, abortController.signal),
  component: PatientDetailsPage,
});
