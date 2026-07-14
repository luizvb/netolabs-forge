const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const neonAuthAvailable = Boolean(neonAuthUrl);

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

export const authUrlForPath = (baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

export function tokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('token' in payload) || typeof payload.token !== 'string') return null;
  return payload.token;
}

function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1_000 : Date.now() + 60_000;
  } catch {
    return Date.now() + 60_000;
  }
}

async function authRequest(path: string, init?: RequestInit) {
  if (!neonAuthUrl) throw new Error('O Google ainda não foi configurado neste ambiente.');
  return fetch(authUrlForPath(neonAuthUrl, path), {
    ...init,
    credentials: 'include',
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
}

async function authError(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return new Error(body.message ?? 'Não foi possível concluir a autenticação com o Google.');
}

export async function neonAccessToken() {
  if (!neonAuthUrl) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt - 30_000 > Date.now()) return cachedAccessToken.value;
  const response = await authRequest('/token');
  if (response.status === 401) return null;
  if (!response.ok) throw await authError(response);
  const token = tokenFromPayload(await response.json().catch(() => null));
  cachedAccessToken = token ? { value: token, expiresAt: tokenExpiry(token) } : null;
  return token;
}

export async function signInWithGoogle(callbackPath = '/auth') {
  const response = await authRequest('/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({ provider: 'google', callbackURL: `${window.location.origin}${callbackPath}` }),
  });
  if (!response.ok) throw await authError(response);
  const body = await response.json() as { url?: string };
  if (!body.url) throw new Error('O Neon Auth não retornou a URL de autenticação do Google.');
  window.location.assign(body.url);
}

export async function signOutNeon() {
  cachedAccessToken = null;
  if (!neonAuthUrl) return;
  const response = await authRequest('/sign-out', { method: 'POST', body: '{}' });
  if (!response.ok && response.status !== 401) throw await authError(response);
}
