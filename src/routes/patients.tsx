import { createRoute } from '@tanstack/react-router';
import { loadPatients } from '../features/patients/api';
import { PatientListPage } from '../features/patients/patient-list';
import type { PatientSearch } from '../../shared/patients';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/patients',
  validateSearch: (search: Record<string, unknown>): PatientSearch => ({
    q: typeof search.q === 'string' ? search.q.slice(0, 100) : '',
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 0 &&
      search.page <= 10000
        ? search.page
        : 1,
    status: search.status === 'archived' ? 'archived' : 'active',
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) =>
    loadPatients(deps, abortController.signal),
  component: PatientListPage,
});
