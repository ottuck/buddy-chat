import { auth } from './firebase';
import { apiUrl } from './api-url';

// A failure the server described with a stable code (docs/server-design.md). UI copy for each
// code lives in the app's messages.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

// The current Firebase ID token. The SDK refreshes it when it is close to expiring.
export async function idToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'UNAUTHORIZED');
  return user.getIdToken();
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await idToken()}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new ApiError(response.status, body?.code ?? 'UNKNOWN');
  }
  return (await response.json()) as T;
}
