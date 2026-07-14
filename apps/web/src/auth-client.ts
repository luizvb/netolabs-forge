const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const neonAuthAvailable = Boolean(neonAuthUrl);

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let callbackExchange: { verifier: string; promise: Promise<void> } | null = null;
let accessTokenRequest: { epoch: number; promise: Promise<string | null> } | null = null;
let authEpoch = 0;

const sessionVerifierParam = 'neon_auth_session_verifier';

export const authUrlForPath = (baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

export function tokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('token' in payload) || typeof payload.token !== 'string') return null;
  const token = payload.token.trim();
  const segments = token.split('.');
  return segments.length === 3 && segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment)) ? token : null;
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

async function exchangeCallbackVerifier() {
  const verifier = callbackVerifier();
  if (!verifier) return;

  if (!callbackExchange || callbackExchange.verifier !== verifier) {
    cachedAccessToken = null;
    const promise = (async () => {
      const query = new URLSearchParams({ [sessionVerifierParam]: verifier });
      const response = await authRequest(`/get-session?${query.toString()}`);
      if (!response.ok) throw await authError(response);
      removeCallbackVerifier(verifier);
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
  cachedAccessToken = token ? { value: token, expiresAt: tokenExpiry(token) } : null;
  return token;
}

export async function neonAccessToken() {
  if (!neonAuthUrl) return null;
  const epoch = authEpoch;
  await exchangeCallbackVerifier();
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
