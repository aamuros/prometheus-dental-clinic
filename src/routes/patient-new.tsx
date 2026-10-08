import { createRoute } from '@tanstack/react-router';
import { PatientForm } from '../features/patients/patient-form';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/patients/new',
  component: PatientForm,
});
