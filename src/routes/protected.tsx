import { createRoute, Outlet } from '@tanstack/react-router';
import { loadStaffSession } from '../features/auth/session';
import { SessionControls } from '../features/auth/session-controls';
import { Route as rootRoute } from './root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async () => ({ session: await loadStaffSession() }),
  component: ProtectedLayout,
});

export function ProtectedLayout() {
  const { session } = Route.useRouteContext();
  return (
    <>
      <SessionControls session={session} />
      <Outlet />
    </>
  );
}
