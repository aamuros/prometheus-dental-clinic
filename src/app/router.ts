import {
  createBrowserHistory,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { Route as rootRoute } from '../routes/root';
import { Route as homeRoute } from '../routes/index';
import { Route as loginRoute } from '../routes/login';
import { Route as protectedRoute } from '../routes/protected';
import { Route as staffRoute } from '../routes/staff';
import { Route as patientsRoute } from '../routes/patients';
import { Route as patientNewRoute } from '../routes/patient-new';
import { Route as patientDetailsRoute } from '../routes/patient-details';
import { Route as patientEditRoute } from '../routes/patient-edit';
import { Route as appointmentsRoute } from '../routes/appointments';
import { Route as appointmentNewRoute } from '../routes/appointment-new';
import { Route as appointmentEditRoute } from '../routes/appointment-edit';
import { Route as dentalRecordsRoute } from '../routes/dental-records';

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([
    homeRoute,
    staffRoute,
    patientsRoute,
    patientNewRoute,
    patientDetailsRoute,
    patientEditRoute,
    appointmentsRoute,
    appointmentNewRoute,
    appointmentEditRoute,
    dentalRecordsRoute,
  ]),
]);

export function createAppRouter(
  history: RouterHistory = createBrowserHistory(),
) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
