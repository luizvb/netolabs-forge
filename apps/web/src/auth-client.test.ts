import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authBaseUrl = 'https://example.neonauth.dev/auth';

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
    let finishExchange!: (response: Response) => void;
    const exchangeResponse = new Promise<Response>((resolve) => { finishExchange = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/get-session?')) return exchangeResponse;
      if (url.endsWith('/token')) return Promise.resolve(jsonResponse({ token: 'header.payload.signature' }));
      return Promise.reject(new Error(`Unexpected auth request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken } = await loadClient();

    const first = neonAccessToken();
    const second = neonAccessToken();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${authBaseUrl}/get-session?neon_auth_session_verifier=one%2Btime`);

    finishExchange(jsonResponse({ session: { user: { id: 'user' } } }));
    await expect(Promise.all([first, second])).resolves.toEqual(['header.payload.signature', 'header.payload.signature']);

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
  });

  it('serves a valid token from cache and clears the cache on sign-out', async () => {
    installWindow('https://forge.test/auth');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'first.payload.signature' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ token: 'second.payload.signature' }));
    vi.stubGlobal('fetch', fetchMock);
    const { neonAccessToken, signOutNeon } = await loadClient();

    await expect(neonAccessToken()).resolves.toBe('first.payload.signature');
    await expect(neonAccessToken()).resolves.toBe('first.payload.signature');
    expect(fetchMock).toHaveBeenCalledOnce();

    await signOutNeon();
    await expect(neonAccessToken()).resolves.toBe('second.payload.signature');

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${authBaseUrl}/token`,
      `${authBaseUrl}/sign-out`,
      `${authBaseUrl}/token`,
    ]);
  });
});
