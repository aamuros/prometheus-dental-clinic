# Prometheus Dental Clinic

A dental clinic management system foundation for staff access, patients,
appointments, clinical records, and billing. React and the Hono API build and
ship together as one Cloudflare Worker with Static Assets.

Database tooling and staff authentication are installed. Better Auth uses Drizzle
and Neon for administrator/staff accounts and sessions. [Patient management](docs/patients.md)
supports patient records, search, editing and archiving. Other clinic workflows remain
planned in the [development roadmap](docs/roadmap.md). The starter UI requires
login; `GET /api/health` remains public and does not connect to the database.

## Stack and requirements

- React 19, Vite, TanStack Router, strict TypeScript
- Hono on Cloudflare Workers with the official Cloudflare Vite plugin
- Neon PostgreSQL, Drizzle ORM, and Drizzle Kit
- Tailwind CSS 4 and shadcn/ui configuration, tokens, and class utilities
- Vitest, Testing Library, ESLint, Prettier, GitHub Actions
- Node.js 24.19.0 (`.node-version`) and pnpm 12.10.1 (`packageManager`)

Dependencies are pinned. Include `pnpm-lock.yaml` with dependency changes and
review required build scripts before allowing them. TypeScript 6 is retained
until the pinned TypeScript ESLint tooling supports TypeScript 7.

## Local setup

1. Clone this repository and enter `prometheus-dental-clinic`.
2. Install the Node version in `.node-version` and pnpm 12.10.1. If Corepack is
   available, `corepack enable` exposes the pinned package manager.
3. Install dependencies and generate Worker binding types:

   ```sh
   pnpm install --frozen-lockfile
   pnpm cf:types
   ```

4. Complete the Neon and [staff authentication setup](docs/authentication.md).
   Login requires local Worker secrets and the authentication migration. Unit
   tests, the health endpoint and the production build need no live database.
5. Start the application:

   ```sh
   pnpm dev
   ```

   Open the URL printed by Vite (normally `http://127.0.0.1:5173`). The existing
   home page reports API connectivity, and `/api/health` returns `{"status":"ok"}`.

6. Run `pnpm check` before submitting changes.

## Neon and migrations

Use the existing `prometheus-dental-clinic-development` Neon project
(`muddy-boat-93080753`) in organization `org-solitary-paper-36906181`, branch
`development` (`br-red-sun-b3nj2cwd`), and database `prometheus_dental_clinic`.
It runs PostgreSQL 18 in `aws-ap-southeast-1`. Do not create another project or
select production for local setup. Use synthetic data until the
[production security checklist](docs/security.md) is implemented. Before
production use, configure a runtime role with only necessary data permissions
and a separate migration role with DDL permissions.

With an authenticated Neon CLI, link and pull only the database variables:

```sh
neon link --org-id org-solitary-paper-36906181 --project-id muddy-boat-93080753 --branch-id br-red-sun-b3nj2cwd --no-env-pull --no-config -y
neon env pull --project-id muddy-boat-93080753 --branch br-red-sun-b3nj2cwd --file .env.local --env DATABASE_URL --env DATABASE_URL_UNPOOLED --env NEON_BRANCH
```

Copy the examples only if the local files do not already exist:

```sh
cp -n .dev.vars.example .dev.vars
```

Copy the pulled pooled URL into `.dev.vars` and complete the
[authentication secrets](docs/authentication.md). Keep secret files readable
only by their owner (`chmod 600 .env.local .dev.vars`).

| Variable                | File         | Purpose                                                                    |
| ----------------------- | ------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`          | `.dev.vars`  | Pooled runtime connection (`-pooler` hostname), exposed only to the Worker |
| `DATABASE_URL_UNPOOLED` | `.env.local` | Direct connection for Node-only migration tooling                          |

Keep TLS enabled (`sslmode=require`). Neither file is committed. `.env.example`
documents the direct migration URL for optional manual `.env` setup; a pulled
`.env.local` is sufficient, so leave `.env` absent unless needed. The `db:*`
scripts use Node's built-in environment-file support; externally supplied
process variables take precedence. The scripts also read Neon CLI's `.env.local`;
values in `.env` override `.env.local`. Before migrating or starting locally,
remove stale database overrides from `.env` and the process environment, or
ensure both URL values match `.env.local` exactly. Keep `.dev.vars` synchronized
after every pull. Never print secret values while checking them. No dotenv
dependency is needed. Wrangler
loads `.dev.vars` for the Worker; the migration URL is not a Worker binding.
Never use `VITE_*` for either connection string, since those values are public.

`worker/db/client.ts` exports `createDatabase(c.env)` for future server handlers.
It uses Neon's HTTP driver without a connection pool, Hyperdrive binding, or
Node compatibility flag. It creates no network request until a query runs.
Keep database code in `worker/`; never import it into `src/` or `shared/`.
`db.batch()` supports non-interactive transactions over HTTP. Interactive
`db.transaction()` callbacks are unsupported by this adapter; a feature needing
them will require a deliberate connection strategy change.

The Neon CLI context in ignored `.neon` selects the development project and
branch above. `neon.ts` declares an empty configuration: no additional services
or branch settings. Linking and pulling credentials do not provision services,
deploy the application, or run Drizzle migrations. When `.dev.vars` is absent,
Wrangler can load the runtime `DATABASE_URL` from `.env.local` instead. Check the
project, branch, and database before database writes. Keep migration tests
on disposable children of development and never verify against production.

`worker/db/schema.ts` defines the Better Auth tables and exports the patient,
appointment, and dental-record tables. For an empty development database, apply
the five committed migrations with `pnpm db:migrate`. For schema changes:

```sh
pnpm db:generate
# Review the generated SQL and snapshots in drizzle/ before applying them.
pnpm db:migrate
```

Generation works offline without credentials. Migration requires a configured
`DATABASE_URL_UNPOOLED` and network access. Drizzle Kit uses the Neon WebSocket
driver for migration transactions in Node; Worker queries use HTTP. Commit
reviewed SQL and metadata under `drizzle/` alongside each schema change. Test
migrations on an isolated Neon branch before applying them to production.
Migrations are separate from Worker requests, `pnpm check`, and deployment;
no command automatically migrates production.

To repeat the real Hono/Drizzle check in the local Workers runtime:

```sh
pnpm build
pnpm db:verify
```

This requires development credentials, network access, and an available localhost
port `8789`. The harness refuses a production context or conflicting credential
overrides, verifies the actual Hono binding before SQL, runs `SELECT 1` and HTTP
transaction checks, then stops workerd. Its entry point lives only in
`tests/runtime/`; no verification endpoint is added to the application. The
ordinary `pnpm check` remains independent of live database access.
See the [database verification record](docs/database-verification.md) for migration
results, cleanup, and driver limitations.

## Commands

| Command                             | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | React development server and local Workers runtime                   |
| `pnpm build`                        | Production client assets and Worker bundle                           |
| `pnpm typecheck`                    | Check frontend, Worker, tooling, and database configuration          |
| `pnpm lint`                         | ESLint, including frontend/Worker import boundaries                  |
| `pnpm format:check`                 | Verify formatting                                                    |
| `pnpm format`                       | Apply formatting                                                     |
| `pnpm test`                         | Credential-free frontend, API, and database-client unit tests        |
| `pnpm check`                        | Typecheck, lint, formatting, tests, and production build             |
| `pnpm cf:types`                     | Regenerate Worker bindings from Wrangler configuration               |
| `pnpm db:generate`                  | Generate SQL migrations from the Drizzle schema                      |
| `pnpm db:migrate`                   | Apply reviewed migrations to the configured direct database URL      |
| `pnpm db:verify`                    | Verify development credentials and SQL in local workerd              |
| `pnpm auth:bootstrap`               | Create the first administrator on an empty development database      |
| `pnpm auth:verify`                  | Verify authentication against development in local workerd           |
| `pnpm patients:smoke-data <action>` | Seed, check or clean up synthetic patient workflow fixtures          |
| `pnpm preview`                      | Rebuild and run the production application locally with workerd      |
| `pnpm audit --audit-level=high`     | Review dependency vulnerabilities                                    |
| `pnpm deploy:check`                 | Run checks and package a deployment without uploading                |
| `pnpm deploy`                       | Run checks and deploy with Wrangler; requires explicit authorization |

Unit tests mock database transport and require no external accounts. They do
not establish live database connectivity or verify the Workers runtime. Follow
[the runtime/browser smoke procedure](docs/verification.md#reproducible-manual-browser-smoke-test)
when validating a release or an integration in workerd.

## Structure

```text
src/                   Browser entry point, routes, components, styles, helpers
shared/api.ts          Runtime-independent API contracts
worker/
  app.ts               Hono middleware and routes
  index.ts             Typed Cloudflare Worker entry point
  bindings.d.ts        Generated Worker binding declarations
  db/client.ts         Request-scoped Neon HTTP / Drizzle database factory
  db/schema.ts         Drizzle table definitions (currently empty)
drizzle.config.ts      Node-only migration configuration
neon.ts                Neon service configuration (currently empty)
drizzle/               Migration journal; SQL and snapshots added with tables
tests/                 Frontend, API, and database-client unit tests
docs/                  Architecture, conventions, roadmap, security, verification
.github/workflows/     CI and manually triggered deployment
```

Add business features in `src/features/<feature>/` and
`worker/features/<feature>/` as needed. Keep routes focused on composition and
avoid speculative service/repository layers. Regenerate `worker/bindings.d.ts`
after binding changes; generated declarations are excluded from formatting
and linting, but remain typechecked.

## Environment and deployment

### Vercel

Import this repository into Vercel with the repository root as the Root Directory
and Node.js **24.x**. `vercel.json` selects Vite, installs with the pinned pnpm
version, runs `pnpm build:vercel`, and serves `dist/client`. The Node.js API
function in `api/index.ts` reuses the existing Hono application and runs in
Singapore (`sin1`). API routes take precedence over the SPA fallback, so direct
navigation to frontend routes works without sending API requests to HTML.
Static security headers mirror `public/_headers`; Hono retains its API headers.

In Vercel Project Settings → Environment Variables, configure these server-only
values for each environment you deploy:

- `DATABASE_URL`: the pooled runtime URL for the intended existing Neon database.
- `BETTER_AUTH_SECRET`: a strong random secret of at least 32 characters.
- `BETTER_AUTH_URL`: the exact HTTPS origin staff will use, without a trailing
  slash or path (for example, `https://clinic.example.com`).

Use a stable preview domain and a separate development database for previews;
set its exact origin as the Preview `BETTER_AUTH_URL`. Better Auth deliberately
trusts only this configured origin, so arbitrary preview URLs cannot be used
interchangeably. Configure the production domain before staff sign in, and
redeploy after changing environment variables. Do not prefix secrets with
`VITE_` or provide migration credentials to the deployment.

Deploy from the Vercel dashboard after configuring these values. Verify
`/api/health`, a direct frontend route, and staff login on the deployed origin.
The deployment does not generate or apply migrations; it requires the existing
schema and staff accounts. Cloudflare's `pnpm build`, `pnpm dev`, and
`pnpm deploy` commands and Wrangler configuration remain available unchanged.

### Cloudflare

`wrangler.jsonc` identifies the Worker as `prometheus-dental-clinic` and declares
`DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in `secrets.required`.
This stores only names, generates binding types, and lets Wrangler validate
missing deployed secrets. Local secret
files are not uploaded by deployment.

Follow [the deployment guide](docs/deployment.md) for initial secret provisioning,
production migrations, deployment commands, verification, and remaining blockers.

Before an explicitly authorized Cloudflare deployment:

- Configure the target Cloudflare account and ensure the Worker name is available.
- Configure an encrypted `DATABASE_URL` Worker secret for the production Neon
  branch. For an existing Worker, `pnpm exec wrangler secret put DATABASE_URL`
  prompts for the value and deploys a new version immediately; run it only with
  deployment authorization. For initial provisioning, Wrangler also supports
  `--secrets-file` on deployment to upload secrets alongside code. Include only
  runtime secrets in that ignored file, never migration credentials.
- Configure `BETTER_AUTH_SECRET` with a fresh random value of at least 32 characters
  and `BETTER_AUTH_URL` with the exact deployed HTTPS origin, without a trailing
  slash or path. The origin must match the URL staff use to sign in.
- Review and apply production migrations separately with a protected direct URL.
- For GitHub Actions, create the `production` environment, restrict it to `main`,
  and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment secrets.
  Scope the token to the target account and necessary Worker permissions.
  `DATABASE_URL` belongs to the deployed Worker; CI does not need it for checks.
- Protect `main` with pull requests and the **check** status. The **Deploy**
  workflow is manually triggered from `main`; pushes do not deploy automatically.

After authorization, use `pnpm exec wrangler login` if needed and `pnpm deploy`,
or the protected **Deploy** workflow. The Cloudflare Vite plugin generates one
combined deployment; do not deploy `dist/client` separately. Verify client/API
routing, security headers, and database access after adding database-backed routes.

Before storing patient information, complete authentication, server-side
permissions, validation, safe logging, retention, and tested backup restoration.
See [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md),
[conventions](docs/conventions.md), and the [roadmap](docs/roadmap.md).
The template stabilization results in [verification](docs/verification.md) are
historical evidence, not verification of the clinic's database or future features.
