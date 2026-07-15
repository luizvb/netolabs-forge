import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleCalendarError,
  createGoogleCalendarEvent,
  createGoogleOAuthState,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  googleAuthorizationUrl,
  googleCalendarConfigured,
  googleEventId,
  refreshGoogleAccessToken,
  removeBusySlots,
  verifyGoogleOAuthState,
  type GoogleCalendarEnvironment,
} from './google-calendar.js';

const env: GoogleCalendarEnvironment = {
  AUTH_SECRET: 'test-auth-secret-with-more-than-32-characters',
  GOOGLE_CALENDAR_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALENDAR_REDIRECT_URI: 'https://forge.example/api/calendar-connections/google/callback',
  GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

afterEach(() => vi.unstubAllGlobals());

describe('Google Calendar adapter', () => {
  it('builds a short-lived signed OAuth state and least-privilege offline authorization URL', () => {
    const state = createGoogleOAuthState({ agentId: 'agent-id', workspaceId: 'workspace-id', userId: 'user-id' }, env, 1_000_000);
    expect(verifyGoogleOAuthState(state, env, 1_001_000)).toMatchObject({ agentId: 'agent-id', workspaceId: 'workspace-id', userId: 'user-id' });
    const url = new URL(googleAuthorizationUrl(state, env));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('scope')).toContain('calendar.events');
    expect(() => verifyGoogleOAuthState(`${state.slice(0, -1)}x`, env, 1_001_000)).toThrow(/inválido/i);
    expect(() => verifyGoogleOAuthState(state, env, 1_700_000)).toThrow(/expirou/i);
  });

  it('encrypts refresh tokens with authenticated encryption and rejects a different key', () => {
    const encrypted = encryptGoogleRefreshToken('refresh-token-value', env);
    expect(encrypted).not.toContain('refresh-token-value');
    expect(decryptGoogleRefreshToken(encrypted, env)).toBe('refresh-token-value');
    expect(() => decryptGoogleRefreshToken(encrypted, { ...env, GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') })).toThrow(/credencial/i);
    expect(googleCalendarConfigured(env)).toBe(true);
    expect(googleCalendarConfigured({ ...env, GOOGLE_CALENDAR_CLIENT_SECRET: '' })).toBe(false);
  });

  it('removes exact and partial overlaps returned by Google FreeBusy', () => {
    const slots = [
      { startAt: '2026-07-16T12:00:00.000Z', endAt: '2026-07-16T12:30:00.000Z' },
      { startAt: '2026-07-16T12:30:00.000Z', endAt: '2026-07-16T13:00:00.000Z' },
      { startAt: '2026-07-16T13:00:00.000Z', endAt: '2026-07-16T13:30:00.000Z' },
    ];
    expect(removeBusySlots(slots, [{ start: '2026-07-16T12:15:00.000Z', end: '2026-07-16T12:45:00.000Z' }])).toEqual([slots[2]]);
  });

  it('marks invalid refresh grants as requiring reconnection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'content-type': 'application/json' } })));
    await expect(refreshGoogleAccessToken('expired', env)).rejects.toMatchObject({ code: 'GOOGLE_CALENDAR_REAUTH_REQUIRED', reauthRequired: true });
  });

  it('uses a deterministic Google-safe event id and recovers a retry from the existing event', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    expect(googleEventId(sessionId)).toMatch(/^[a-v0-9]{5,1024}$/);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: googleEventId(sessionId), htmlLink: 'https://calendar.google.com/event' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const event = await createGoogleCalendarEvent({ accessToken: 'access', calendarId: 'primary', sessionId, summary: 'Diagnóstico', startAt: '2026-07-16T12:00:00.000Z', endAt: '2026-07-16T12:30:00.000Z', timeZone: 'America/Sao_Paulo', attendeeName: 'Lead', attendeeContact: 'lead@example.com' });
    expect(event.id).toBe(googleEventId(sessionId));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/events/${googleEventId(sessionId)}`);
  });
});
