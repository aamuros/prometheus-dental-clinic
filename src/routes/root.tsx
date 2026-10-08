import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { NotFound } from '../components/not-found';
import { RouteError } from '../components/route-error';

export const Route = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
  pendingComponent: () => <p role="status">Loading application…</p>,
});

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col px-6">
      <header className="border-b border-border py-6">
        <Link to="/" className="text-sm font-semibold tracking-tight">
          Web Application
        </Link>
      </header>
      <main className="flex-1 py-16 sm:py-24">
        <Outlet />
      </main>
    </div>
  );
}
