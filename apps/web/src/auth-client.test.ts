import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authBaseUrl = 'https://example.neonauth.dev/auth';

function base64UrlJson(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function syntheticJwt(payload: Record<string, unknown> = {}) {
  return `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson({ sub: 'user', exp: Math.floor(Date.now() / 1_000) + 3_600, ...payload })}.signature`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installWindow(initialUrl: string) {
  let currentUrl = new URL(initialUrl);
  const replaceState = vi.fn((_state: unknown, _title: string, nextUrl?: string | URL | null) => {
    if (nextUrl) currentUrl = new URL(String(nextUrl), currentUrl);
  });
  const history = { state: { preserved: true }, replaceState };
  vi.stubGlobal('window', {
    get location() {
      return { href: currentUrl.href, origin: currentUrl.origin };
    },
    history,
  });
  return { currentUrl: () => currentUrl, replaceState };
}

async function loadClient() {
  vi.stubEnv('VITE_NEON_AUTH_URL', authBaseUrl);
  return import('./auth-client');
}

describe('Neon Auth browser client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('exchanges one callback verifier before requesting one access token and cleans the URL without navigation', async () => {
    const browser = installWindow('https://forge.test/auth?intent=publish&neon_auth_session_verifier=one%2Btime#draft');
    const token = syntheticJwt();
    let finishExchange!: (response: Response) => void;
    const exchangeResponse = new Promise<Response>((resolve) => { finishExchange = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/get-session?')) return exchangeResponse;
      if (url.endsWith('/token')) return Promise.resolve(jsonResponse({ token }));
      return Promise.reject(new Error(`Unexpected auth request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken } = await loadClient();

    const first = neonAccessToken();
    const second = neonAccessToken();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${authBaseUrl}/get-session?neon_auth_session_verifier=one%2Btime`);

    finishExchange(jsonResponse({ session: { id: 'session' }, user: { id: 'user' } }));
    await expect(Promise.all([first, second])).resolves.toEqual([token, token]);

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${authBaseUrl}/get-session?neon_auth_session_verifier=one%2Btime`,
      `${authBaseUrl}/token`,
    ]);
    expect(browser.replaceState).toHaveBeenCalledOnce();
    expect(browser.currentUrl().href).toBe('https://forge.test/auth?intent=publish#draft');
  });

  it('keeps a failed verifier fail-closed and does not replay it or request a token', async () => {
    const browser = installWindow('https://forge.test/auth?neon_auth_session_verifier=expired&intent=publish');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'Invalid or expired Neon Auth session' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken } = await loadClient();

    await expect(neonAccessToken()).rejects.toThrow('Invalid or expired Neon Auth session');
    await expect(neonAccessToken()).rejects.toThrow('Invalid or expired Neon Auth session');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/get-session?neon_auth_session_verifier=expired');
    expect(browser.replaceState).not.toHaveBeenCalled();
    expect(browser.currentUrl().searchParams.get('neon_auth_session_verifier')).toBe('expired');
  });

  it.each([
    ['a null session response', () => jsonResponse({ session: null, user: null })],
    ['a malformed response body', () => new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } })],
  ])('keeps %s fail-closed without verifier cleanup, token request or replay', async (_label, response) => {
    const browser = installWindow('https://forge.test/auth?neon_auth_session_verifier=invalid-shape&intent=publish');
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken } = await loadClient();

    await expect(neonAccessToken()).rejects.toThrow('O Neon Auth não retornou uma sessão válida');
    await expect(neonAccessToken()).rejects.toThrow('O Neon Auth não retornou uma sessão válida');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/get-session?neon_auth_session_verifier=invalid-shape');
    expect(browser.replaceState).not.toHaveBeenCalled();
    expect(browser.currentUrl().searchParams.get('neon_auth_session_verifier')).toBe('invalid-shape');
  });

  it('uses the existing-session token path without a verifier and rejects malformed or absent tokens', async () => {
    installWindow('https://forge.test/auth?intent=publish');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'not-a-jwt' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await loadClient();

    await expect(client.neonAccessToken()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${authBaseUrl}/token`);
    expect(client.tokenFromPayload({})).toBeNull();
    expect(client.tokenFromPayload({ token: '' })).toBeNull();
    expect(client.tokenFromPayload({ token: 'not-a-jwt' })).toBeNull();
    expect(client.tokenFromPayload({ token: `***.${base64UrlJson({ exp: Math.floor(Date.now() / 1_000) + 60 })}.signature` })).toBeNull();
    expect(client.tokenFromPayload({ token: `ew.${base64UrlJson({ exp: Math.floor(Date.now() / 1_000) + 60 })}.signature` })).toBeNull();
    expect(client.tokenFromPayload({ token: `${base64UrlJson('not-an-object')}.${base64UrlJson({ exp: Math.floor(Date.now() / 1_000) + 60 })}.signature` })).toBeNull();
    expect(client.tokenFromPayload({ token: `${base64UrlJson({ alg: 'RS256' })}.${base64UrlJson([])}.signature` })).toBeNull();
    expect(client.tokenFromPayload({ token: syntheticJwt({ exp: undefined }) })).toBeNull();
    expect(client.tokenFromPayload({ token: syntheticJwt({ exp: 'later' }) })).toBeNull();
    expect(client.tokenFromPayload({ token: syntheticJwt({ exp: Number.MAX_VALUE }) })).toBeNull();
    expect(client.tokenFromPayload({ token: syntheticJwt({ exp: Math.floor(Date.now() / 1_000) - 1 }) })).toBeNull();
  });

  it('serves a valid token from cache and clears the cache on sign-out', async () => {
    installWindow('https://forge.test/auth');
    const firstToken = syntheticJwt({ tokenVersion: 1 });
    const secondToken = syntheticJwt({ tokenVersion: 2 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: firstToken }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ token: secondToken }));
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken, signOutNeon } = await loadClient();

    await expect(neonAccessToken()).resolves.toBe(firstToken);
    await expect(neonAccessToken()).resolves.toBe(firstToken);
    expect(fetchMock).toHaveBeenCalledOnce();

    await signOutNeon();
    await expect(neonAccessToken()).resolves.toBe(secondToken);

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${authBaseUrl}/token`,
      `${authBaseUrl}/sign-out`,
      `${authBaseUrl}/token`,
    ]);
  });

  it('does not clean a callback verifier when sign-out invalidates its in-flight exchange', async () => {
    const browser = installWindow('https://forge.test/auth?intent=publish&neon_auth_session_verifier=in-flight#draft');
    let finishExchange!: (response: Response) => void;
    const exchangeResponse = new Promise<Response>((resolve) => { finishExchange = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/get-session?')) return exchangeResponse;
      if (url.endsWith('/sign-out')) return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.reject(new Error(`Unexpected auth request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken, signOutNeon } = await loadClient();

    const tokenRequest = neonAccessToken();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signOutRequest = signOutNeon();
    finishExchange(jsonResponse({ session: { id: 'session' }, user: { id: 'user' } }));

    await expect(tokenRequest).resolves.toBeNull();
    await signOutRequest;
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${authBaseUrl}/get-session?neon_auth_session_verifier=in-flight`,
      `${authBaseUrl}/sign-out`,
    ]);
    expect(browser.replaceState).not.toHaveBeenCalled();
    expect(browser.currentUrl().href).toBe('https://forge.test/auth?intent=publish&neon_auth_session_verifier=in-flight#draft');
  });
});
