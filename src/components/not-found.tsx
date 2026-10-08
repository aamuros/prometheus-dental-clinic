import { Link } from '@tanstack/react-router';

export function NotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link
        to="/"
        className="inline-block text-sm underline underline-offset-4"
      >
        Return home
      </Link>
    </section>
  );
}
