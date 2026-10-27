/** A JSON request to the Flask API; throws the server's `error` message on failure. */
export async function api<T = unknown>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return readResponse<T>(res);
}

/** A failed API request: the server's `error` message, and the HTTP status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** An API response's JSON; throws its `error` message, or its status when the body isn't JSON (a 405 page, say). */
export async function readResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;
  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error || `${res.status} ${res.statusText}`, res.status);
  return data as T;
}

export const enc = encodeURIComponent;
