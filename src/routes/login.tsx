import { createRoute } from '@tanstack/react-router';
import { LoginForm } from '../features/auth/login-form';
import { Route as rootRoute } from './root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (
    search: Record<string, unknown>,
  ): { passwordChanged?: true } =>
    search.passwordChanged === true ? { passwordChanged: true } : {},
  component: LoginForm,
});
