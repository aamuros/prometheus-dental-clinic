# Prometheus Dental Clinic

Staff access, patient management, appointments and dental records in one React
SPA and Hono API deployed together on Vercel. The application uses React 19,
Vite, TypeScript, TanStack Router, Better Auth, Neon PostgreSQL, Drizzle ORM/Kit,
pnpm and GitHub Actions. Billing remains planned in the [roadmap](docs/roadmap.md).

## Development

Use Node 24.19.0 (`.node-version`) and pnpm 12.10.1 (`packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite serves `http://127.0.0.1:5173` and proxies `/api` to the loopback Node Hono
server on port 3001. React hot reload and Node watch mode are enabled. Both
processes stop together. The public `/api/health` needs no credentials; staff
features need the environment below and an existing account.

## Environment and Neon

Reuse project `muddy-boat-93080753`, development branch `br-red-sun-b3nj2cwd`,
database `prometheus_dental_clinic`, region `aws-ap-southeast-1`. Do not reset it
or create another project. The nine application/auth tables and five migrations
are already installed. Do not rerun setup against production.

With an authenticated Neon CLI:

```sh
neon link --org-id org-solitary-paper-36906181 --project-id muddy-boat-93080753 --branch-id br-red-sun-b3nj2cwd --no-env-pull --no-config -y
neon env pull --project-id muddy-boat-93080753 --branch br-red-sun-b3nj2cwd --file .env.local --env DATABASE_URL --env DATABASE_URL_UNPOOLED --env NEON_BRANCH
```

Add the auth variables from [.env.example](.env.example) to ignored `.env.local`;
a Neon pull replaces that file, so preserve local auth values privately first.
Protect it with `chmod 600 .env.local`. Existing local auth values can be carried
from the previous `.dev.vars`; the application no longer loads that file.

| Variable                | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`          | Pooled Neon HTTP runtime connection; server only         |
| `DATABASE_URL_UNPOOLED` | Direct connection for reviewed migrations; operator only |
| `BETTER_AUTH_SECRET`    | Random secret of at least 32 characters                  |
| `BETTER_AUTH_URL`       | Exact origin, locally `http://127.0.0.1:5173`            |
| `NEON_BRANCH`           | `development`, required by guarded verification tools    |

Node scripts load `.env.local`, then optional `.env`; process variables take
precedence. Remove conflicting overrides. Never put credentials in `VITE_*`,
source, browser modules, logs or command arguments. Vercel uses environment
variables for server credentials; preview origins derive from its exact deployment
metadata. See [authentication](docs/authentication.md).

The Neon HTTP driver and all reviewed migrations remain unchanged. Use pooled
runtime URLs and direct migration URLs for the same database, with TLS required.
`db.batch()` supports HTTP transactions; interactive callbacks are unsupported.
For a deliberate schema change, generate, review, then apply SQL on a disposable
development branch first:

```sh
pnpm db:generate
pnpm db:migrate
```

Migrations never run during build, requests or deployment.

## Commands

| Command                               | Purpose                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                            | Vite frontend and Node API with hot reload                                |
| `pnpm build` / `pnpm build:vercel`    | NodeNext server check and Vite assets                                     |
| `pnpm preview`                        | Build and serve assets plus API on port 4180                              |
| `pnpm typecheck`                      | Strict frontend, Node server and tooling checks                           |
| `pnpm lint` / `pnpm format:check`     | ESLint and Prettier                                                       |
| `pnpm test` / `pnpm check`            | Credential-free tests / complete CI checks                                |
| `pnpm audit --audit-level=high`       | Dependency audit                                                          |
| `pnpm db:verify` / `pnpm auth:verify` | Guarded live Node/Neon checks                                             |
| `pnpm workflows:verify`               | Synthetic patient, appointment and clinical API verification with cleanup |
| `pnpm auth:bootstrap`                 | First development admin, only if account table is empty                   |
| `pnpm patients:smoke-data`            | Synthetic patient fixtures                                                |
| `pnpm appointments:smoke-data`        | Synthetic fixtures and live scheduling verification                       |
| `pnpm dental-records:smoke-data`      | Synthetic fixtures and live clinical-history verification                 |

## Deployment and organization

Vercel project `prometheus-dental-clinic`, team `aamuros-projects`, uses Git
integration: non-main branches create previews; `main` is the production target.
GitHub Actions runs checks and audits, and never deploys or migrates. This
migration must be reviewed through a PR; production release and environment
changes require separate authorization. See [deployment](docs/deployment.md)
and [verification](docs/verification.md).

`src/` contains browser features, `server/` contains Hono features and database
code, `shared/` contains portable contracts, `api/index.ts` is the Vercel Node
entry, and `drizzle/` contains reviewed SQL/history. Explicit `.js` imports and
NodeNext checks preserve plain Node ESM resolution. Server/test/operator code
is never imported into the browser. Test-only fixtures are never deployed.

Read [architecture](docs/architecture.md), [conventions](docs/conventions.md),
and the [production security checklist](docs/security.md) before extending the
application or handling real patient information.
