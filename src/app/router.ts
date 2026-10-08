import {
  createBrowserHistory,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { Route as rootRoute } from '../routes/root';
import { Route as homeRoute } from '../routes/index';

const routeTree = rootRoute.addChildren([homeRoute]);

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
