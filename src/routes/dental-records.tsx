import { createRoute } from '@tanstack/react-router';
import type { DentalRecordKind } from '../../shared/dental-records';
import { loadPatient } from '../features/patients/api';
import { loadDentalRecords } from '../features/dental-records/api';
import { DentalRecordsPage } from '../features/dental-records/dental-records-page';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/patients/$patientId/dental-records',
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind: DentalRecordKind; page: number } => ({
    kind: search.kind === 'treatment' ? 'treatment' : 'note',
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 0 &&
      search.page <= 10000
        ? search.page
        : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, abortController }) => {
    const [patient, records] = await Promise.all([
      loadPatient(params.patientId, abortController.signal),
      loadDentalRecords(
        params.patientId,
        deps.kind,
        deps.page,
        abortController.signal,
      ),
    ]);
    return { patient, records };
  },
  component: DentalRecordsPage,
});
