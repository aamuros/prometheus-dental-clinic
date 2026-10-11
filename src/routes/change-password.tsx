import { createRoute } from '@tanstack/react-router';
import { ChangePasswordForm } from '../features/auth/change-password-form';
import { Route as protectedRoute } from './protected';

export const Route = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/change-password',
  component: ChangePasswordPage,
});
export function ChangePasswordPage() {
  const { session } = Route.useRouteContext();
  return (
    <ChangePasswordForm
      required={session.user.passwordChangeRequired === true}
    />
  );
}
