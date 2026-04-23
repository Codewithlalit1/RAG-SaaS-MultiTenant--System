import { getToken, clearAuth } from './auth';

// Regular API calls go through Next.js rewrites (/api/* → Express).
// SSE and FormData uploads bypass the proxy and hit Express directly so the
// Next.js server doesn't buffer streaming responses.
export const DIRECT_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    throw new ApiError(res.status, body.error ?? 'Request failed', body.code);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
};
