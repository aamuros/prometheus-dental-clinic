import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../worker/db/client';

describe('Worker database client', () => {
  it.each(['', '   '])(
    'rejects a missing connection without private details',
    (url) => {
      expect(() => createDatabase({ DATABASE_URL: url })).toThrow(
        'DATABASE_URL is required',
      );
    },
  );

  it('queries over HTTP using the connection supplied by each request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        fields: [{ name: 'value', dataTypeID: 23 }],
        rows: [['1']],
        rowCount: 1,
        command: 'SELECT',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const firstUrl =
      'postgresql://test:placeholder@first.example.invalid/clinic?sslmode=require';
    const secondUrl =
      'postgresql://test:placeholder@second.example.invalid/clinic?sslmode=require';
    const first = createDatabase({ DATABASE_URL: firstUrl });
    const second = createDatabase({ DATABASE_URL: secondUrl });
    expect(fetchMock).not.toHaveBeenCalled();

    const result = await first.execute(sql`select ${1} as value`);
    await second.execute(sql`select ${1} as value`);

    expect(result.rows).toEqual([{ value: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.invalid/sql',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.example.invalid/sql',
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(
        'Neon-Connection-String',
      ),
    ).toContain(firstUrl);
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get(
        'Neon-Connection-String',
      ),
    ).toContain(secondUrl);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'select $1 as value', params: ['1'] }),
      }),
    );
  });
});
