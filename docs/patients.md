# Patient management

Patient management adds name, birth date, contact number, optional email,
creation/update timestamps, and an archive timestamp. Existing styling and the
code-based TanStack router are retained; staff navigation links to `/patients`.

## Permissions and API

All patient endpoints require a current server-validated admin/staff session.
Both roles may list, view, create, and edit active patients. Only administrators
may archive. These are clinic-wide records in this single application; there is
no per-user ownership or organization layer.

| Endpoint                         | Access      | Behavior                                                                               |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `GET /api/patients`              | Admin/staff | Active patients by default; `q`, `page`, and `status=active\|archived` select the list |
| `POST /api/patients`             | Admin/staff | Create a patient; returns 201                                                          |
| `GET /api/patients/:id`          | Admin/staff | View active or archived details                                                        |
| `PUT /api/patients/:id`          | Admin/staff | Replace editable fields on an active patient                                           |
| `POST /api/patients/:id/archive` | Admin       | Archive without deleting; repeated requests preserve the original archive timestamp    |

There is no permanent-delete API. Archived records remain readable, are excluded
from the active list, and cannot be edited (409). The UI asks for confirmation
before archiving and provides an archived-list filter. Restoring archived records
is outside this feature.

Create/update bodies contain `name`, `birthDate` (`YYYY-MM-DD`), `contactNumber`,
and optional `email` (missing, null, or blank becomes null). The server rejects
unexpected fields, invalid IDs/JSON/calendar dates, future birth dates, control
characters, invalid email, and contact numbers outside 7–15 digits. Names are
limited to 200 characters, contact numbers to 30 including formatting, and email
to 254. Phone formatting allows an optional leading `+`, spaces, parentheses,
and hyphens. Mutation bodies are limited to 8 KiB.

The birth-date maximum uses the current clinic date in Asia/Manila on both
the server and the form, including the hours before UTC reaches that date.

Writes require `Origin` to match `BETTER_AUTH_URL`; UI visibility does not grant
permission. Responses remain uncached, errors safe, and logs omit patient fields
and search strings. Drizzle binds query values; search treats `%`, `_`, and
backslashes literally. Lists return at most 50 rows and `hasMore`, with stable
name/ID ordering and bounded page/search parameters. Updates and archiving check
active status in the database mutation itself.

## Organization

- `server/features/patients/`: table, input validation, Drizzle queries and Hono routes.
- `src/features/patients/`: API contract checks, list, details and shared add/edit form.
- `shared/patients.ts`: runtime-independent input/response types.
- `src/routes/patient*.tsx`: protected routing and loader composition.
- `drizzle/0001_dazzling_eternals.sql`: patients table, constraints and partial active-name index.
- `tests/patients.test.ts` and `tests/patients-ui.test.tsx`: validation, CRUD, roles, origins, archive rules and UI interactions.

## Verification

Credential-free tests preserve the API and UI behavior described above. Use
`pnpm check` for CI checks, then the guarded Node/Neon procedure in
[verification](verification.md) for live integration checks. Synthetic fixtures
remain in ignored `.local/` and must be cleaned after the run. The smoke helpers
use the existing development project and reject other database endpoints.
