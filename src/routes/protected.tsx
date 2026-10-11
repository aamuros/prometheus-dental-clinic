import {
  createRoute,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { loadStaffSession } from '../features/auth/session';
import { SessionControls } from '../features/auth/session-controls';
import { Route as rootRoute } from './root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async ({ location }) => {
    const session = await loadStaffSession();
    if (
      session.user.passwordChangeRequired &&
      location.pathname.replace(/\/+$/, '') !== '/change-password'
    )
      throw redirect({ to: '/change-password', replace: true });
    return { session };
  },
  component: ProtectedLayout,
});

export function ProtectedLayout() {
  const { session } = Route.useRouteContext();
  const location = useLocation();
  return (
    <>
      <SessionControls session={session} />
      {(!session.user.passwordChangeRequired ||
        location.pathname.replace(/\/+$/, '') === '/change-password') && (
        <Outlet />
      )}
    </>
  );
}
