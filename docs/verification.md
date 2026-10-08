# Template verification

Version 1.0 stabilization verified on 2026-10-08 with Node.js 24.19.0 and pnpm
12.10.1 on macOS arm64, on branch `chore/v1-release-readiness`. The inspected
GitHub `main` commit was `6cfc50a24622c9572b27be9a817d379685c07100`.

## Findings verified against GitHub

Read-only GitHub API checks at the initial inspection established the following;
no remote repository settings were changed.

| Finding                | Current evidence                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Template mode          | Already enabled: repository API returned `is_template: true`.                                                                                                                                                                  |
| Default branch         | `main`.                                                                                                                                                                                                                        |
| Branch protection      | Absent: `protected: false`, protection endpoint returned `404 Branch not protected`, and repository rulesets were empty.                                                                                                       |
| Production environment | Absent: the environments endpoint returned zero environments.                                                                                                                                                                  |
| Existing CI            | The [latest main run](https://github.com/aamuros/prometheus-web-template/actions/runs/37743522231) succeeded. Its `check` job completed frozen installation, `pnpm check`, and the high/critical audit successfully on GitHub. |
| Cloud deployment       | Not verified. No deployment workflow run appeared in the five-run query, but workflow history alone does not establish whether a manual cloud deployment exists.                                                               |

Commands used: `gh auth status`, `gh api repos/aamuros/prometheus-web-template`,
the repository's `branches/main`, `branches/main/protection`, `rulesets`, and
`environments` API endpoints, `gh run list --limit 5`, and the successful run's
`actions/runs/37743522231/jobs` endpoint. Repository access permitted reading all
these settings; the branch-protection 404 indicates missing protection.

## Independent application check

Copied the 43 tracked and new source/configuration/documentation files into
`/private/tmp/prometheus-v1-c9h2br2j`, without `.git`, dependencies, build outputs,
or local environment files. This was an isolated clean-copy test, **not GitHub
template generation**. No repository was created and no deployment was made.

In the copy, renamed package name/description, Worker name, HTML title/description,
and visible application name. The generated Worker configuration retained
`prometheus-v1-smoke`, and the built HTML and JavaScript contained the renamed
application title. The frontend assets and Worker bundle were built together;
the generated Worker configuration pointed to `../client` for its assets.

The frozen install reused pnpm's normal package store: 290 packages reused, zero
downloaded. The lockfile remained byte-for-byte unchanged (SHA-256
`a91a776ed776dddf661b3855ab692b7f3626b311f0459b23384282c0d12c6b15`).
The copy started without `.env`, `.dev.vars`, or external credentials. Reviewed
source and configuration contain no account-specific credentials, local package
links, runtime dependency on the original template, or Atlas integration.

## Executed checks

The mandatory checks below ran in the renamed clean copy. Server commands also
used `WRANGLER_SEND_METRICS=false` and `WRANGLER_LOG_PATH=.wrangler/logs` to keep
diagnostic logs local. Development and preview ran outside the execution sandbox
with approval after the sandbox blocked their listening port.

| Command/check                                           | Actual outcome                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --reporter=append-only` | Passed with the pinned package manager; lockfile unchanged.                                                                                   |
| `pnpm check`                                            | Passed strict frontend/Worker/tooling typechecks, ESLint with zero warnings, formatting, all 14 tests in two files, and the production build. |
| `pnpm audit --audit-level=high`                         | Passed: no known vulnerabilities reported.                                                                                                    |
| `pnpm dev --port 5175 --strictPort`                     | Started the frontend and local Worker without application credentials; HTTP routing checks below passed.                                      |
| `pnpm preview --port 4175 --strictPort`                 | Rebuilt and started the production application in workerd; HTTP routing, assets, and headers below passed.                                    |
| `pnpm why sharp` and installed Miniflare metadata       | Confirmed `sharp@0.35.5` is used, while Miniflare `5.20261006.0-alpha` still pins `0.35.4`; retain the security override.                     |

HTTP checks used `curl -sS --max-time 15 -D -` with
`Sec-Fetch-Mode: navigate` and `Accept: text/html` against both local servers,
and assertions on status, content type, and body:

- `/` and `/missing`: HTML 200, the renamed title and React mount point, and
  identical SPA shells. React rendering and the not-found view passed in Vitest;
  HTTP shell checks do not prove browser rendering.
- `/api/health`: JSON 200 with `{"status":"ok"}`.
- `/api` and `/api/missing`: JSON 404 with `{"error":"Not found"}`, even when
  requested as browser navigations; neither received SPA HTML.
- Production preview additionally returned 405 and `Allow: GET, HEAD` for
  `POST /api/health`, and 200 for `HEAD /api/health`.
- Both built JavaScript and CSS URLs served 200 with their expected content types.
- Production static and API responses included CSP, nosniff, frame denial,
  no-referrer, and permissions headers. API responses also had
  `Cache-Control: no-store`.

Existing tests cover health/headers, HEAD, unsupported methods, unknown APIs,
safe exception handling, redacted logs, React rendering with the Hono contract,
unknown client routes, request/contract/network failures, and rendering errors.
No additional browser dependency or duplicate unit tests were added. Both
verification servers were stopped after use.

## Failures encountered and resolved

- The first clean-copy `pnpm check` stopped at formatting: the longer renamed
  HTML description needed wrapping. `pnpm exec prettier --write index.html`
  fixed the copy, then the full check passed. The README now includes formatting
  after renaming. This was a renamed fixture issue, not an application defect.
- Sandboxed development and preview starts failed with `listen EPERM` on the
  Cloudflare inspector port `9229`. Approved runs outside the sandbox passed;
  application configuration was not weakened.
- The login shell emitted a sandbox permission warning while creating an fnm
  multishell symlink. Subsequent commands used a non-login shell with the same
  verified Node/pnpm versions.

No mandatory check remains failing. This report and the final README edit were
completed after the clean-copy runtime test. Final `pnpm format:check` and
`git diff --check` passed in the original repository to validate those
documentation changes.

Before merging, `pnpm install --frozen-lockfile --reporter=append-only`,
`pnpm check`, `pnpm audit --audit-level=high`, and `git diff --check` were also
rerun in the original repository. All passed, including all 14 tests and both
production bundles; the audit reported no known vulnerabilities.

## Reproducible manual browser smoke test

Use this for release verification and changes to routing, deployment tooling,
or Cloudflare bindings. A permanent browser test dependency is not justified by
this starter's single page and existing React/API coverage; reconsider Playwright
when meaningful business workflows exist.

1. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Open its printed local
   URL in a browser. Confirm **Application ready**, **API connected**, the expected
   application name, and a successful JSON `/api/health` request in Network tools.
2. Navigate directly to `/missing`. Confirm **Page not found**, then click
   **Return home**. Confirm the working home page returns through client routing
   without a new document request.
3. Navigate directly to `/api/health`, `/api`, and `/api/missing`. Confirm health
   JSON 200 and unknown-route JSON 404 responses rather than the application page.
4. Stop development, run `pnpm preview`, and repeat steps 1–3 at its printed URL.
   Check Console/Network for script, asset, or CSP errors and verify static/API
   headers. Stop preview afterward.
5. After an authorized deployment, repeat steps 1–3 and the header/console checks
   at the deployed HTTPS URL. Test any application-specific access controls too.

This manual browser procedure was **not executed during this stabilization
pass**. Earlier browser claims are not being carried forward as current evidence.

## Remaining external actions and limitations

1. Configure a GitHub rule for `main`: require pull requests and the **check** CI
   status, block force pushes and deletion, and keep mandatory reviewer counts
   optional for this small team. The current repository has no such rule.
2. Create a `production` environment, select **Selected branches and tags**, and
   allow the `main` branch only. Add scoped `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` environment secrets and optional reviewer approval.
   The deployment job now has a `main` guard, but its changed workflow has only
   been reviewed locally and has not executed on GitHub.
3. Confirm CI for the published `main` commit. Use GitHub's
   **Use this template → Create a new repository**
   to create a private throwaway application, clone it, rename its metadata,
   and repeat the frozen install, checks, development, and preview procedure.
   Confirm its own GitHub/Cloudflare settings; template generation copies files,
   not branch protection, environments, or secrets. Live generation is untested.
4. With Cloudflare deployment authorization, choose a unique Worker name in the
   generated application. Either run `pnpm exec wrangler login` and `pnpm deploy`,
   or run the protected **Deploy** workflow from `main`. Run the browser smoke
   procedure at the deployment URL. Cloud upload, account permissions, hosted
   routing, deployment credentials, and custom domains remain untested.

A network-cold dependency installation was not performed. Browser/server
environment isolation was reviewed through the separate TypeScript configurations,
ESLint import boundaries, example files, and source; no application environment
variables were needed or injected. Node/jsdom tests and local workerd cannot
verify future bindings or application security controls. Authentication,
authorization, data storage, monitoring, and recovery remain application-specific;
follow [the production security checklist](security.md) before using private data.

**Release recommendation: Ready after external verification.** Local mandatory
checks and independent application runtime checks pass. Apply GitHub protections,
verify live template generation and Cloudflare deployment, and complete the
browser smoke procedure before declaring the release externally verified.
