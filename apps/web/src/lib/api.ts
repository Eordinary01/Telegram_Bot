export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const TOKEN_KEY = 'jecrc_auth_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

/**
 * Performs an authenticated fetch against the API.
 * Attaches the stored JWT as a Bearer token.
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Builds the SSE stream URL including the token as a query param
 * (EventSource cannot set custom headers).
 */
export function streamUrl(path: string): string {
  const token = getToken();
  const separator = path.includes('?') ? '&' : '?';
  return `${API_URL}${path}${separator}token=${encodeURIComponent(token ?? '')}`;
}
