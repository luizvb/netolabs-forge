const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const neonAuthAvailable = Boolean(neonAuthUrl);

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let callbackExchange: { verifier: string; promise: Promise<void> } | null = null;
let accessTokenRequest: { epoch: number; promise: Promise<string | null> } | null = null;
let authEpoch = 0;

const sessionVerifierParam = 'neon_auth_session_verifier';

export const authUrlForPath = (baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

function jsonObjectFromBase64Url(segment: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function tokenExpiresAt(token: string) {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[2] || !/^[A-Za-z0-9_-]+$/.test(segments[2])) return null;
  const header = jsonObjectFromBase64Url(segments[0]);
  const payload = jsonObjectFromBase64Url(segments[1]);
  if (!header || !payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  const expiresAt = payload.exp * 1_000;
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : null;
}

export function tokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('token' in payload) || typeof payload.token !== 'string') return null;
  const token = payload.token.trim();
  return tokenExpiresAt(token) ? token : null;
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

function isSessionResponseData(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const data = value as { session?: unknown; user?: unknown };
  return Boolean(
    data.session && typeof data.session === 'object' && !Array.isArray(data.session)
    && data.user && typeof data.user === 'object' && !Array.isArray(data.user),
  );
}

function callbackVerifier() {
  if (typeof window === 'undefined') return null;
  const verifier = new URL(window.location.href).searchParams.get(sessionVerifierParam)?.trim();
  return verifier || null;
}

function removeCallbackVerifier(verifier: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(sessionVerifierParam)?.trim() !== verifier) return;
  url.searchParams.delete(sessionVerifierParam);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

async function exchangeCallbackVerifier(epoch: number) {
  const verifier = callbackVerifier();
  if (!verifier) return;

  if (!callbackExchange || callbackExchange.verifier !== verifier) {
    cachedAccessToken = null;
    const promise = (async () => {
      const query = new URLSearchParams({ [sessionVerifierParam]: verifier });
      const response = await authRequest(`/get-session?${query.toString()}`);
      if (!response.ok) throw await authError(response);
      const data = await response.json().catch(() => null);
      if (!isSessionResponseData(data)) throw new Error('O Neon Auth não retornou uma sessão válida. Tente entrar novamente.');
      if (epoch === authEpoch) removeCallbackVerifier(verifier);
    })();
    callbackExchange = { verifier, promise };
  }

  await callbackExchange.promise;
}

async function requestAccessToken(epoch: number) {
  const response = await authRequest('/token');
  if (response.status === 401 || epoch !== authEpoch) return null;
  if (!response.ok) throw await authError(response);
  const token = tokenFromPayload(await response.json().catch(() => null));
  if (epoch !== authEpoch) return null;
  const expiresAt = token ? tokenExpiresAt(token) : null;
  cachedAccessToken = token && expiresAt ? { value: token, expiresAt } : null;
  return expiresAt ? token : null;
}

export async function neonAccessToken() {
  if (!neonAuthUrl) return null;
  const epoch = authEpoch;
  await exchangeCallbackVerifier(epoch);
  if (epoch !== authEpoch) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt - 30_000 > Date.now()) return cachedAccessToken.value;
  if (!accessTokenRequest || accessTokenRequest.epoch !== epoch) {
    const promise = requestAccessToken(epoch);
    accessTokenRequest = { epoch, promise };
    void promise.then(
      () => { if (accessTokenRequest?.promise === promise) accessTokenRequest = null; },
      () => { if (accessTokenRequest?.promise === promise) accessTokenRequest = null; },
    );
  }
  return accessTokenRequest.promise;
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
  const pendingExchange = callbackExchange?.promise;
  authEpoch += 1;
  cachedAccessToken = null;
  callbackExchange = null;
  accessTokenRequest = null;
  await pendingExchange?.catch(() => undefined);
  if (!neonAuthUrl) return;
  const response = await authRequest('/sign-out', { method: 'POST', body: '{}' });
  if (!response.ok && response.status !== 401) throw await authError(response);
}
