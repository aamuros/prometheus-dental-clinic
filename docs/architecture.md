# Architecture

## One application, one deployment

Prometheus Dental Clinic is a feature-oriented modular monolith: one React SPA and one Hono API, compiled and deployed together as one Cloudflare Worker with Static Assets. A small team can change UI and API behavior in the same pull request without managing independent services or a shared package platform.

Cloudflare's official Vite plugin runs API code in workerd during development and preview. `assets.not_found_handling: single-page-application` serves the React shell for client routes. `run_worker_first: ["/api", "/api/*"]` explicitly reserves API routes for Hono, including direct browser navigation. Missing API routes return JSON 404 responses rather than the SPA HTML. Static assets bypass the Worker, keeping routine page delivery simple and inexpensive.

## Frontend/backend boundary

`src/` runs in the browser; `worker/` runs on the server. Separate TypeScript configurations keep browser globals and Cloudflare runtime globals distinct. ESLint rejects imports from Worker files into browser code. `shared/api.ts` contains only runtime-independent contracts, and consumers use type-only imports. Do not put credentials, database clients, or server bindings in shared modules.

The health request uses same-origin `fetch` and checks the small response shape at runtime. TypeScript contracts do not validate untrusted input. A Hono RPC client or schema validation can be added when a larger API warrants it; the base does not need either abstraction. No CORS policy is needed for this same-origin application; do not add permissive CORS by default.

## Routing and UI

TanStack Router uses its supported code-based route tree. With two routes, explicit assembly avoids a generator, generated source, and another development dependency. The library recommends file-based routing for larger applications; migrate when route count makes it worthwhile. Route views live under `src/routes/`, and `src/app/router.ts` assembles the tree. The root route owns layout, pending, not-found, and safe error views. Route errors hide internal exception details.

The home loader calls the real health endpoint, demonstrating the integration without adding a client-side cache library. For richer server state, TanStack Query is the approved default, but it is not needed for a single request.

Tailwind 4 uses its Vite plugin and CSS-first `@theme` configuration. `components.json`, semantic CSS tokens, and `cn` provide the shadcn/ui foundation. The supported `new-york` style uses the established `clsx`/`tailwind-merge` utility. Add individual components only as needed, review their installed dependencies and styles, and verify the production CSP. There is no preinstalled component collection, icon pack, animation library, or dark-mode switch.

## Feature organization

When a feature is introduced, place its UI, hooks, and browser helpers in `src/features/<feature>/`. Keep route files focused on navigation and composition. Place its Hono routes and warranted business logic in `worker/features/<feature>/`, mounted from `worker/app.ts` with a clear `/api/<resource>` prefix. Add tests close to the established `tests/` organization until colocating feature tests becomes useful.

Handlers should parse/validate input, enforce access, invoke business logic, and translate results into HTTP responses. Extract functions or services when the logic benefits from independent tests or reuse. Add repositories only when persistence access genuinely needs an abstraction. Do not introduce layers, dependency injection, or universal business models in advance.

## API and security defaults

Hono returns JSON, a minimal uncached health response, 404 for unknown routes, 405 for unsupported health methods, and safe error envelopes. `HTTPException` status codes are preserved while their messages are hidden. A generic exception becomes a 500 response. Request logs include only method, status, and duration, avoiding URLs, query strings, headers, bodies, and exception messages that may contain protected information. Add controlled diagnostics and request correlation when needed.

API headers are set in Hono; `public/_headers` covers static responses. Explicit API routes and same-origin requests avoid unnecessary middleware and infrastructure. Better Auth requires AsyncLocalStorage; `nodejs_als` enables that API without full Node compatibility. Auth and database secrets are request-scoped Worker bindings.

## Optional integrations

### Database foundation

Neon PostgreSQL and Drizzle ORM/Kit are configured. `worker/db/client.ts`
creates a request-scoped Drizzle client using Neon's HTTP driver and the
`DATABASE_URL` Worker secret. Pass `c.env` when a future handler needs database
access; do not initialize it globally or add database work to the health route.
This connection strategy does not require Hyperdrive or `nodejs_compat`.
The HTTP driver supports individual queries and `db.batch()` transactions.
Interactive `db.transaction()` callbacks are unsupported by the Drizzle HTTP
adapter; revisit the strategy when a feature requires them. This distinction
has been verified in workerd, including batch failure recovery.

`worker/db/schema.ts` defines Better Auth's user, account, session, verification,
and rate-limit tables, and exports the feature-owned patient and appointment
tables. [Appointment scheduling](appointments.md) uses a database exclusion
constraint to prevent concurrent dentist bookings and reuses authenticated staff
accounts with a separate dentist designation. `drizzle.config.ts`
generates reviewed SQL and snapshots under `drizzle/`; commit those when the
first schema is added. The Node-only migration command uses a direct
`DATABASE_URL_UNPOOLED` connection from ignored `.env` / `.env.local` or the process environment.
Wrangler reads the runtime connection from ignored `.dev.vars` locally and an
encrypted Worker secret in production. Migrations run separately from requests
and deployment, against a development Neon branch before production.

The Neon CLI uses ignored `.neon` for its project/branch context and pulls URLs
into ignored `.env.local`. `neon.ts` declares the requested empty service policy;
applying it does not deploy the Cloudflare Worker or run database migrations.
The current linked branch is the schema-only `development` branch. Use disposable
development children for migration verification. `.env` takes precedence over `.env.local`
in the migration scripts, while supplied process variables take precedence over both.

`pnpm db:verify` runs a test-only Hono entry point in local workerd, checks its
binding against development credentials before any SQL, and stops the runtime
afterward. It is excluded from credential-free CI checks and the application
entry point. See the [database verification record](database-verification.md).

`worker/bindings.d.ts` is generated from `wrangler.jsonc` with `pnpm cf:types`.
Hono and the Worker entry point use these bindings. `secrets.required` contains
names only and keeps generation independent of local credential files. Keep
generated declarations out of manual formatting and regenerate after changing
bindings. Existing platform types remain supplied by `@cloudflare/workers-types`.

### Future integrations

Install and configure approved technologies in the generated application, following their official documentation and current Cloudflare compatibility guidance. No installer system or unused configuration is provided.

| Need                        | Approved approach and considerations                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server state                | TanStack Query; use query keys, invalidation, and loader integration deliberately.                                                                                                                    |
| Forms and validation        | React Hook Form and Zod when warranted; validate again on the server.                                                                                                                                 |
| Relational storage          | PostgreSQL, Drizzle ORM/Kit, and Neon; choose a Workers-compatible HTTP or supported connection strategy, define migrations, and protect credentials. Keep migrations separate from request handling. |
| Authentication              | Better Auth; confirm its Worker runtime and database adapter requirements, use secure server-managed sessions, and plan CSRF/session handling.                                                        |
| Authorization               | Enforce permissions in every relevant API operation; hiding UI controls is insufficient. Add application-specific RBAC only when needed.                                                              |
| Files                       | Cloudflare R2 bindings; validate uploads and enforce access before issuing URLs or returning objects.                                                                                                 |
| Background work             | Cloudflare Cron/Queues; add handlers, typed bindings, retry and idempotency behavior when a real job exists.                                                                                          |
| Browser regression coverage | Playwright when meaningful user workflows exist; keep unit tests credential-free.                                                                                                                     |
| Observability and email     | Sentry and an appropriate email provider; redact protected data, keep keys server-side, and assess operating cost.                                                                                    |

Before handling patient or other private clinic information, implement authentication, authorization, validation, suitable logging, backups with tested restore, security validation, and a deployment access model. See the [development roadmap](roadmap.md) and [production checklist](security.md).

## Official guidance checked

- [Cloudflare React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) and [asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [TanStack code-based routing](https://tanstack.com/router/latest/docs/framework/react/routing/code-based-routing)
- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite) and [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite)
- [Vitest configuration](https://vitest.dev/guide/)

Package peer requirements were checked against published package metadata before installation. See the verification report for actual tested versions and limitations.
