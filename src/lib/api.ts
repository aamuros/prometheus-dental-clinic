import type { HealthResponse } from '../../shared/api';

export async function loadHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error('API request failed.');

  const data: unknown = await response.json();
  if (
    typeof data !== 'object' ||
    data === null ||
    !('status' in data) ||
    data.status !== 'ok'
  ) {
    throw new Error('Invalid API response.');
  }
  return { status: data.status };
}
