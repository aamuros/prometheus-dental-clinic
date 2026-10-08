import { createRoute } from '@tanstack/react-router';
import {
  addClinicDays,
  clinicDate,
  clinicWeekStart,
  isClinicDate,
} from '../../shared/appointments';
import { loadAppointments } from '../features/appointments/api';
import { AppointmentListPage } from '../features/appointments/appointment-list';
import { Route as protectedRoute } from './protected';

export type ScheduleSearch = {
  date: string;
  view: 'list' | 'day' | 'week';
  page: number;
};
export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/appointments',
  validateSearch: (search: Record<string, unknown>): ScheduleSearch => ({
    date:
      typeof search.date === 'string' &&
      isClinicDate(search.date) &&
      search.date < '9999-12-25'
        ? search.date
        : clinicDate(),
    view:
      search.view === 'day' || search.view === 'week' ? search.view : 'list',
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 0 &&
      search.page <= 10000
        ? search.page
        : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) => {
    const from = deps.view === 'week' ? clinicWeekStart(deps.date) : deps.date;
    return loadAppointments(
      {
        from,
        to: addClinicDays(from, deps.view === 'week' ? 7 : 1),
        page: deps.page,
      },
      abortController.signal,
    );
  },
  component: AppointmentListPage,
});
