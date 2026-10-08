import { createRoute } from '@tanstack/react-router';
import { LoginForm } from '../features/auth/login-form';
import { Route as rootRoute } from './root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginForm,
});
