import { createRoute } from '@tanstack/react-router';
import { loadHealth } from '../lib/api';
import { cn } from '../lib/utils';
import { Route as rootRoute } from './root';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: loadHealth,
  component: HomePage,
});

export function HomePage() {
  const health = Route.useLoaderData();

  return (
    <section aria-labelledby="home-heading" className="max-w-xl space-y-5">
      <h1
        id="home-heading"
        className="text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Application ready
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        Your workspace is ready to build on.
      </p>
      <p role="status" className="flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            health.status === 'ok' && 'bg-primary',
          )}
        />
        API connected
      </p>
    </section>
  );
}
