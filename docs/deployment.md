# Cloudflare Workers deployment

The application deploys as one Worker named `prometheus-dental-clinic`, with
React static assets and the Hono API on the same origin. No separate frontend
hosting, API service, Hyperdrive, or managed authentication service is required.

## Runtime and build configuration

`vite.config.ts` already uses the official Cloudflare Vite plugin alongside
React and Tailwind. `pnpm build` produces `dist/client` assets and a Worker bundle
with its generated Wrangler configuration. Wrangler follows the plugin's
generated configuration when deploying from the repository root; deploy the
combined application rather than the client directory alone.

`wrangler.jsonc` retains the existing `2026-10-08` compatibility date and
`nodejs_als` flag. Better Auth's minimal entry point needs AsyncLocalStorage,
and its password utility imports `node:crypto` for `randomBytes` and `scrypt`.
The installed Cloudflare tooling and current runtime documentation enable Node
compatibility by default for dates on or after `2026-08-04`, so the existing
date already supports these imports without an additional flag.
Drizzle uses Neon's fetch-based HTTP adapter, created per request from Worker
bindings. Its Better Auth adapter disables unsupported interactive transactions.
Node-only Drizzle Kit and operator scripts remain outside the Worker entry point.
No extra Node compatibility flag or database transport is needed.

The Vite plugin copies local `.dev.vars` into the ignored Worker build directory
for preview. Treat `dist/` as potentially containing local credentials; do not
publish it as a downloadable archive or CI artifact. The generated client assets
and Worker JavaScript must not contain these secret values. Wrangler uploads the
Worker modules and client assets; deployed secrets are provisioned separately.

Static asset handling serves the SPA shell for client routes such as `/patients`.
`run_worker_first: ["/api", "/api/*"]` reserves API requests for Hono, even for
browser navigation. Unknown APIs return JSON errors rather than SPA HTML;
protected paths require a valid session. Browser requests use relative URLs,
so no `VITE_*` configuration or cross-origin API setup is needed.

Workers Logs collect the existing method, status, and duration messages.
Invocation logs and automatic traces are disabled because they capture request
URLs, which can contain record identifiers. Query-string redaction is enabled
as an additional safeguard. Review account access, retention, and alerts before
processing private information; enabling tracing requires a suitable privacy
policy for the URL metadata it records.

## Prerequisites and production secrets

Use the Node version in `.node-version` and pnpm version in `packageManager`.
Install with `pnpm install --frozen-lockfile`. Confirm the target Cloudflare
account, Worker name, deployed HTTPS origin, and production Neon branch before
any remote write.

| Value                   | Where it belongs                                      | Purpose                                                                                               |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Encrypted Worker secret                               | Production pooled Neon connection using a runtime role with only required permissions                 |
| `BETTER_AUTH_SECRET`    | Encrypted Worker secret                               | Fresh random value of at least 32 characters, generated locally with `openssl rand -base64 32`        |
| `BETTER_AUTH_URL`       | Worker secret, matching the existing required binding | Exact HTTPS origin staff use, without a path or trailing slash                                        |
| `DATABASE_URL_UNPOOLED` | Operator's protected migration environment            | Direct connection to the same production database, using a migration role; never upload to the Worker |
| `CLOUDFLARE_API_TOKEN`  | Protected CI environment or operator environment      | Deployment token scoped to the target account and required Worker permissions                         |
| `CLOUDFLARE_ACCOUNT_ID` | CI or operator environment                            | Explicit target account                                                                               |

Keep development values in ignored `.dev.vars` and migration values in ignored
`.env` / `.env.local`. They are not uploaded automatically. Do not put secrets in
Wrangler `vars`, `VITE_*`, command arguments, source control, or shared modules.

For the first deployment, create an ignored `.dev.vars.production` file with
only `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`, populated through
your secret manager or editor. Restrict its permissions with
`chmod 600 .dev.vars.production`. Keep production credentials separate from
development; never upload `.dev.vars` with its localhost origin and development
database. Wrangler supports uploading this file alongside the first code version.

For an existing Worker, retain its deployed secrets or update individual values
with `pnpm exec wrangler secret put <NAME>` using the hidden interactive prompt.
These updates create and deploy a Worker version immediately. Keep the auth
secret stable across routine code releases. Changing the deployment origin also
requires updating `BETTER_AUTH_URL`.

## Migrations and first administrator

Review the committed SQL under `drizzle/` and test it on an isolated Neon
development branch first. Set `DATABASE_URL_UNPOOLED` in a protected process
environment to the intended production database, then run `pnpm db:migrate`
as a separately authorized action. Process variables override local files;
otherwise `.env` overrides `.env.local`. Check the target before running the
command. Deployment scripts never run migrations automatically.

**Production blocker:** `pnpm auth:bootstrap` intentionally requires the Neon
`development` context, matching development credentials, and an empty user table.
Public sign-up is disabled. A fresh production database therefore needs a
separately reviewed and authorized first-administrator provisioning procedure.
Do not bypass these development guards or copy development users into production
as part of deployment preparation. This task leaves authentication behavior intact.

## Validate and deploy

Run the credential-free checks and packaging rehearsal:

```sh
pnpm deploy:check
pnpm audit --audit-level=high
```

`deploy:check` runs strict typechecks, lint, formatting, unit tests, the Vite
production build, and `wrangler deploy --dry-run`. It does not upload code, run
migrations, provision accounts, or verify remote secrets and database connectivity.

After deployment authorization and completion of the prerequisites:

```sh
pnpm exec wrangler login
pnpm deploy --secrets-file .dev.vars.production
```

Use the second command for initial provisioning with the protected secret file.
For subsequent releases with secrets already configured, use `pnpm deploy`.
Both deploy scripts target the single top-level Wrangler configuration. There are
no separate staging or production Wrangler environments configured.

For GitHub Actions, the existing **Deploy** workflow is manually triggered from
`main` and runs the audit and `pnpm deploy`. Configure a GitHub `production`
environment restricted to `main`, with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. Provision Worker secrets before using this workflow;
it does not upload the local production secret file. Protect `main` with the
required **check** status. No workflow or remote setting is changed by this guide.

## Release verification and rollback

After an authorized upload, check `/api/health` for JSON `{"status":"ok"}`,
direct navigation to `/login` and a client route for the SPA shell, and JS/CSS
asset responses for successful status and correct content types. Confirm `/api`
returns JSON 404; an unauthenticated `/api/session` returns JSON 401. Unknown
protected `/api/*` paths may return 401 before route lookup, and must never serve
SPA HTML. Check static/API security headers, sign-in, session persistence,
authorized database reads, denied access, and sign-out using synthetic data.
Follow [the runtime/browser smoke procedure](verification.md#reproducible-manual-browser-smoke-test)
with the clinic's current authentication flow.

Use `pnpm exec wrangler deployments list` to inspect releases. An authorized
`pnpm exec wrangler rollback <VERSION_ID>` can restore a prior code version;
database migrations and data are not rolled back. Assess migration compatibility
before rolling back code and use the database recovery procedure when required.

Account access, production secrets, migrations, first-admin provisioning, hosted
routing, and live runtime/database checks remain external release gates. Complete
[the production security checklist](security.md), including tested restoration,
before processing patient data. A successful build or dry run does not establish
production readiness.

## Local preparation verification

Verified on 2026-10-09 with Node 24.19.0 and pnpm 12.10.1:

- `pnpm deploy:check` passed frontend/Worker/tooling typechecks, lint, formatting,
  all 186 tests in 10 files, both production bundles, and Wrangler dry-run packaging.
- Generated configuration retained SPA/API routing, all three required bindings,
  and the configured privacy controls. Static headers were preserved, and local
  database/auth secret values were absent from deployable code and client assets.
- Generated Worker binding types were current.
- `pnpm audit --audit-level=high` passed with no high or critical advisories.
  One moderate advisory remains in transitive `esbuild@0.18.20` tooling under
  Drizzle Kit: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
  No dependency changes were made in this deployment task.

No dev/preview server, browser smoke test, database write, or remote deployment
was run. Runtime compatibility was checked against installed tooling, generated
bundles, and current Cloudflare documentation; live request and database behavior
still require the release verification above.

## References

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Worker secrets and first-deploy secret files](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers tracing](https://developers.cloudflare.com/workers/observability/traces/)
- [Workers Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
