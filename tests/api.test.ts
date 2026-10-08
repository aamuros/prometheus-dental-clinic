import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker/app';

// These routes exist only in the test process, before Hono builds its matcher.
app.get('/api/test-error', () => {
  throw new Error('private database connection details');
});
app.get('/api/test-rejection', () => {
  throw new HTTPException(400, { message: 'private validation details' });
});

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('Hono API', () => {
  it('returns a minimal, uncached health response', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('supports HEAD without a response body', async () => {
    const response = await app.request('/api/health', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('rejects unsupported health methods', async () => {
    const response = await app.request('/api/health', { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(await response.json()).toEqual({ error: 'Method not allowed' });
  });

  it.each(['/api', '/api/missing'])('returns JSON 404 for %s', async (path) => {
    const response = await app.request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('returns safe errors and security headers when a handler throws', async () => {
    const response = await app.request('/api/test-error');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves deliberate HTTP error status without exposing its message', async () => {
    const response = await app.request('/api/test-rejection');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Request rejected' });
  });

  it('logs only method, status, and timing', async () => {
    await app.request('/api/health?token=private-value');
    expect(console.info).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\{"method":"GET","status":200,"durationMs":\d+\}$/,
      ),
    );
  });
});
