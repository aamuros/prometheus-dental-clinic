import { Link } from '@tanstack/react-router';
import { Route } from '../../routes/patients';
import type { SubmitEvent } from 'react';

export function PatientListPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void navigate({
      search: {
        q: String(form.get('q')).trim(),
        page: 1,
        status: form.get('status') === 'archived' ? 'archived' : 'active',
      },
    });
  }
  return (
    <section className="space-y-6" aria-labelledby="patients-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          id="patients-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          Patients
        </h1>
        <Link
          to="/patients/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Add patient
        </Link>
      </div>
      <form
        key={`${search.q}-${search.status}`}
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="grow space-y-1 text-sm">
          Search patients
          <input
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            type="search"
            name="q"
            maxLength={100}
            defaultValue={search.q}
            placeholder="Name, contact number, or email"
          />
        </label>
        <label className="space-y-1 text-sm">
          Status
          <select
            className="block rounded-md border border-input bg-background px-3 py-2"
            name="status"
            defaultValue={search.status}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-input px-4 py-2 text-sm"
        >
          Search
        </button>
      </form>
      {data.patients.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              {search.status === 'active'
                ? 'Active patients'
                : 'Archived patients'}
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-3 pr-4">
                  Name
                </th>
                <th scope="col" className="py-3 pr-4">
                  Birth date
                </th>
                <th scope="col" className="py-3 pr-4">
                  Contact number
                </th>
              </tr>
            </thead>
            <tbody>
              {data.patients.map((patient) => (
                <tr key={patient.id} className="border-b border-border">
                  <td className="py-3 pr-4">
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: patient.id }}
                      className="font-medium underline"
                    >
                      {patient.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{patient.birthDate}</td>
                  <td className="py-3 pr-4">{patient.contactNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground">
          No patients found.
        </p>
      )}
      <nav
        aria-label="Patient pages"
        className="flex items-center gap-4 text-sm"
      >
        {search.page > 1 && (
          <Link
            to="/patients"
            search={{ ...search, page: search.page - 1 }}
            className="underline"
          >
            Previous
          </Link>
        )}
        <span>Page {data.page}</span>
        {data.hasMore && (
          <Link
            to="/patients"
            search={{ ...search, page: search.page + 1 }}
            className="underline"
          >
            Next
          </Link>
        )}
      </nav>
    </section>
  );
}
