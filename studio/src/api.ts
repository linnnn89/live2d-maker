export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(route: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/' + route, {
    method: route === 'snapshot' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || '操作失败', response.status);
  return data;
}
