// Client-side token store — localStorage so the dashboard JS can read the JWT.
// The httpOnly refresh cookie is managed by the browser automatically.

const TOKEN_KEY  = 'ragsaas_token';
const APIKEY_KEY = 'ragsaas_apikey';
const TENANT_KEY = 'ragsaas_tenant';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// The raw API key is stored at login time so the document upload endpoint
// (which uses x-api-key auth, not Bearer) can be called from the dashboard.
export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(APIKEY_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(APIKEY_KEY, key);
}

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  vertical: string;
}

export function getTenant(): Tenant | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TENANT_KEY);
  return raw ? (JSON.parse(raw) as Tenant) : null;
}

export function setTenant(tenant: Tenant): void {
  localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(APIKEY_KEY);
  localStorage.removeItem(TENANT_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
