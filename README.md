# Web Application Template

A standalone GitHub repository template for internal business applications. React and Hono ship together on Cloudflare Workers. Each generated repository owns its code, dependencies, infrastructure, and deployment; it has no runtime connection to this template.

The starting application contains one home page, client routing and error handling, and `GET /api/health`. No database, authentication, or business features are installed.

## Stack and requirements

- React 19, Vite, TanStack Router, strict TypeScript
- Hono on Cloudflare Workers with the official Cloudflare Vite plugin
- Tailwind CSS 4 and shadcn/ui configuration, tokens, and class utilities
- Vitest, Testing Library, ESLint, Prettier, GitHub Actions
- Node.js 24.19.0 (see `.node-version`) and pnpm 12.10.1 (see `packageManager`)

Direct dependencies are pinned; commit `pnpm-lock.yaml` when updating them. TypeScript 6 is retained because the pinned TypeScript ESLint tooling does not support TypeScript 7 yet.

## Create a project

1. On the template's GitHub page, select **Use this template → Create a new repository**.
2. Clone your new repository and enter its directory:

   ```sh
   git clone <your-new-repository-url>
   cd <your-new-repository>
   ```

3. Install the Node version in `.node-version`. Install pnpm 12.10.1, or, if Corepack is available, run `corepack enable` to expose the pinned package manager.
4. Install and start:

   ```sh
   pnpm install --frozen-lockfile
   pnpm dev
   ```

   Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). The home page should show **Application ready** and **API connected**. `/api/health` returns `{"status":"ok"}`. No external credentials or environment files are required.

5. Rename the following metadata before deploying:

   | File                  | Update                                     |
   | --------------------- | ------------------------------------------ |
   | `package.json`        | `name` and `description`                   |
   | `wrangler.jsonc`      | `name`, unique for your Cloudflare account |
   | `index.html`          | page title and description                 |
   | `src/routes/root.tsx` | visible application name                   |
   | `README.md`           | project-specific purpose and setup notes   |

   Run `pnpm install` after changing package metadata and commit any lockfile changes. Run `pnpm format` after renaming to keep metadata and source formatting valid. No renaming script is needed.

   Configure your new repository's own branch protection, `production` environment, Cloudflare account, secrets, and any required bindings. GitHub template generation copies files, not those repository settings. If you change the default branch from `main`, update both workflows' branch restrictions. Adapt the template's verification report to your application rather than treating its results as evidence for new features.

6. Run `pnpm check`, then start adding your application's features.

The original repository has GitHub's **Template repository** setting enabled. For another template repository, enable **Settings → General → Template repository** explicitly; repository files do not control it. Set `main` as the default branch. Recommended branch protection: require pull requests and the **check** CI status, block force pushes and branch deletion, and leave mandatory reviewer counts optional for the small team. Require approvals for sensitive application changes as your team grows.

## Commands

| Command                         | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                      | React development server and local Workers runtime              |
| `pnpm build`                    | Production client assets and Worker bundle                      |
| `pnpm typecheck`                | Check frontend, Worker, and tooling separately                  |
| `pnpm lint`                     | ESLint, including frontend/Worker import boundaries             |
| `pnpm format:check`             | Verify formatting                                               |
| `pnpm format`                   | Apply formatting                                                |
| `pnpm test`                     | Run frontend smoke tests and Hono API tests once                |
| `pnpm test:watch`               | Watch unit tests                                                |
| `pnpm check`                    | Typecheck, lint, formatting, tests, and production build        |
| `pnpm preview`                  | Rebuild and run the production application locally with workerd |
| `pnpm audit --audit-level=high` | Review dependency vulnerabilities                               |
| `pnpm deploy`                   | Run all checks, build, and deploy with Wrangler                 |

`pnpm preview` needs no Cloudflare credentials. It is a local preview, not a public deployment. Unit tests use Node and jsdom; they do not start a browser or require external services.

## Structure

```text
src/
  app/            React entry point and router assembly
  routes/         Root layout and home route
  components/     Not-found and error views
  lib/            Browser API access and UI class utility
  styles/         Tailwind and shared design tokens
shared/api.ts     Runtime-independent response contracts
worker/
  app.ts          Hono middleware and routes
  index.ts        Cloudflare Worker entry point
public/_headers   Production static-asset security headers
tests/            Frontend smoke tests and API tests
docs/             Architecture, conventions, and verification
.github/workflows/ CI and manually triggered deployment
```

Create `src/features/<feature>/` and `worker/features/<feature>/` when a business feature needs them. Empty feature directories and unused infrastructure configuration are deliberately omitted.

## Environment and security

The base needs no environment variables. `.env.example` and `.dev.vars.example` explain the boundary without adding unused values:

- `VITE_*` variables are public and embedded in the browser bundle. Never use them for secrets.
- Local Worker secrets belong in `.dev.vars`, which Git ignores. Read them through typed Worker bindings, not browser imports.
- Use `pnpm exec wrangler secret put <NAME>` for production secrets. Configure non-secret bindings in `wrangler.jsonc` only when needed. Add matching binding types when you add infrastructure.
- CI deployment credentials belong in GitHub environment secrets, not repository files.

API responses and static assets receive separate security headers because Cloudflare serves assets without invoking Hono. The production CSP allows same-origin resources and blocks inline scripts/styles; evaluate and adjust it deliberately when integrating components that use inline styles or external services. Vite development uses its development headers so React refresh and CSS updates can work.

**This unauthenticated starter must not store protected client information.** Before handling such information, implement authentication, server-side authorization, input validation, suitable redacted logging, backup/restore procedures, and application-specific security validation. Transport headers alone do not provide those safeguards.

Use the [production security checklist](docs/security.md) before processing private business information. Coding agents should follow [AGENTS.md](AGENTS.md); dependency maintenance is described in [conventions](docs/conventions.md).

## Deploy to Cloudflare Workers

Cloud deployment is separate from local setup and requires your own Cloudflare account. Update the Worker name first.

For an authorized manual deployment:

```sh
pnpm exec wrangler login
pnpm deploy
```

The Cloudflare Vite plugin writes client assets and a Worker configuration during the build; Wrangler uses its generated deployment configuration. Do not manually deploy only `dist/client` or add a second frontend deployment. Verify `/`, an unknown client route, `/api/health`, and an unknown API route at the printed deployment URL.

For GitHub Actions, create a **production** environment, select **Selected branches and tags**, and allow the `main` branch only, with any desired reviewer protection. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment secrets. Scope the token to the target account and the Worker deployment permissions. Then explicitly run the **Deploy** workflow from `main`. Its job also rejects other branches, audits dependencies, and runs `pnpm deploy`, including every mandatory check, before uploading. CI runs on pull requests and pushes to `main` without deployment secrets; pushes do not deploy automatically. The workflow guard complements branch protection and environment restrictions; configure both before production use.

See [architecture](docs/architecture.md), [conventions](docs/conventions.md), and the [verification report](docs/verification.md).
