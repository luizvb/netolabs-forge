import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REQUEST_TIMEOUT_MS = 10_000;

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const;

export type GoogleCalendarEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  'AUTH_SECRET' | 'GOOGLE_CALENDAR_CLIENT_ID' | 'GOOGLE_CALENDAR_CLIENT_SECRET' | 'GOOGLE_CALENDAR_REDIRECT_URI' | 'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY'>>;

export type GoogleOAuthState = {
  agentId: string;
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export type GoogleCalendarItem = {
  id: string;
  summary: string;
  timeZone: string;
  primary: boolean;
  accessRole: string;
};

export type GoogleBusyInterval = { start: string; end: string };
export type GoogleCalendarEvent = { id: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } };

export class GoogleCalendarError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 502, public readonly reauthRequired = false, public readonly upstreamStatus?: number) {
    super(message);
  }
}

function required(env: GoogleCalendarEnvironment, key: keyof GoogleCalendarEnvironment) {
  const value = env[key]?.trim();
  if (!value) throw new GoogleCalendarError('A integração com Google Calendar ainda não foi configurada.', 'GOOGLE_CALENDAR_NOT_CONFIGURED', 503);
  return value;
}

function signingSecret(env: GoogleCalendarEnvironment) {
  const value = required(env, 'AUTH_SECRET');
  if (value.length < 32) throw new GoogleCalendarError('AUTH_SECRET precisa ter ao menos 32 caracteres.', 'GOOGLE_CALENDAR_INVALID_CONFIGURATION', 503);
  return value;
}

function encryptionKey(env: GoogleCalendarEnvironment) {
  const encoded = required(env, 'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new GoogleCalendarError('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY precisa ser uma chave base64 de 32 bytes.', 'GOOGLE_CALENDAR_INVALID_CONFIGURATION', 503);
  return key;
}

export function googleCalendarConfigured(env: GoogleCalendarEnvironment = process.env) {
  try {
    required(env, 'GOOGLE_CALENDAR_CLIENT_ID');
    required(env, 'GOOGLE_CALENDAR_CLIENT_SECRET');
    required(env, 'GOOGLE_CALENDAR_REDIRECT_URI');
    signingSecret(env);
    encryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

export function createGoogleOAuthState(input: Omit<GoogleOAuthState, 'nonce' | 'exp'>, env: GoogleCalendarEnvironment = process.env, now = Date.now()) {
  const payload: GoogleOAuthState = { ...input, nonce: randomBytes(18).toString('base64url'), exp: Math.floor(now / 1_000) + 10 * 60 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingSecret(env)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyGoogleOAuthState(state: string, env: GoogleCalendarEnvironment = process.env, now = Date.now()) {
  const [encoded, signature, extra] = state.split('.');
  if (!encoded || !signature || extra) throw new GoogleCalendarError('Estado OAuth inválido.', 'GOOGLE_OAUTH_INVALID_STATE', 400);
  const expected = createHmac('sha256', signingSecret(env)).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new GoogleCalendarError('Estado OAuth inválido.', 'GOOGLE_OAUTH_INVALID_STATE', 400);
  let payload: GoogleOAuthState;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GoogleOAuthState; }
  catch { throw new GoogleCalendarError('Estado OAuth inválido.', 'GOOGLE_OAUTH_INVALID_STATE', 400); }
  if (!payload.agentId || !payload.workspaceId || !payload.userId || !payload.nonce || payload.exp < Math.floor(now / 1_000)) {
    throw new GoogleCalendarError('O início da conexão expirou. Tente conectar novamente.', 'GOOGLE_OAUTH_EXPIRED_STATE', 400);
  }
  return payload;
}

export function googleAuthorizationUrl(state: string, env: GoogleCalendarEnvironment = process.env) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: required(env, 'GOOGLE_CALENDAR_CLIENT_ID'),
    redirect_uri: required(env, 'GOOGLE_CALENDAR_REDIRECT_URI'),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    state,
  }).toString();
  return url.toString();
}

export function encryptGoogleRefreshToken(token: string, env: GoogleCalendarEnvironment = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptGoogleRefreshToken(value: string, env: GoogleCalendarEnvironment = process.env) {
  const [version, iv, tag, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new GoogleCalendarError('Credencial de calendário inválida.', 'GOOGLE_CALENDAR_INVALID_CREDENTIAL', 503, true);
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new GoogleCalendarError('Não foi possível abrir a credencial do calendário.', 'GOOGLE_CALENDAR_INVALID_CREDENTIAL', 503, true);
  }
}

async function googleRequest<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }); }
  catch { throw new GoogleCalendarError('O Google Calendar não respondeu a tempo.', 'GOOGLE_CALENDAR_UNAVAILABLE', 503); }
  const body = await response.json().catch(() => ({})) as T & { error?: string | { message?: string; status?: string } };
  if (!response.ok) {
    const oauthError = typeof body.error === 'string' ? body.error : body.error?.status;
    const reauth = response.status === 401 || oauthError === 'invalid_grant' || oauthError === 'UNAUTHENTICATED';
    throw new GoogleCalendarError(reauth ? 'A autorização do Google Calendar expirou. Reconecte a agenda.' : fallback, reauth ? 'GOOGLE_CALENDAR_REAUTH_REQUIRED' : 'GOOGLE_CALENDAR_REQUEST_FAILED', reauth ? 503 : 502, reauth, response.status);
  }
  return body;
}

export async function exchangeGoogleAuthorizationCode(code: string, env: GoogleCalendarEnvironment = process.env) {
  return googleRequest<{ access_token: string; refresh_token?: string; scope?: string; expires_in: number }>(GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
      code,
      client_id: required(env, 'GOOGLE_CALENDAR_CLIENT_ID'),
      client_secret: required(env, 'GOOGLE_CALENDAR_CLIENT_SECRET'),
      redirect_uri: required(env, 'GOOGLE_CALENDAR_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  }, 'Não foi possível concluir a autorização do Google Calendar.');
}

export async function refreshGoogleAccessToken(refreshToken: string, env: GoogleCalendarEnvironment = process.env) {
  const result = await googleRequest<{ access_token: string; expires_in: number }>(GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: required(env, 'GOOGLE_CALENDAR_CLIENT_ID'),
      client_secret: required(env, 'GOOGLE_CALENDAR_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  }, 'Não foi possível renovar a autorização do Google Calendar.');
  return result.access_token;
}

function bearer(accessToken: string) { return { authorization: `Bearer ${accessToken}` }; }

export async function listGoogleCalendars(accessToken: string) {
  const url = new URL(`${GOOGLE_API_URL}/users/me/calendarList`);
  url.searchParams.set('minAccessRole', 'writer');
  url.searchParams.set('showHidden', 'false');
  const result = await googleRequest<{ items?: Array<{ id?: string; summary?: string; timeZone?: string; primary?: boolean; accessRole?: string }> }>(url.toString(), { headers: bearer(accessToken) }, 'Não foi possível listar os calendários disponíveis.');
  return (result.items ?? []).filter((item): item is Required<typeof item> => Boolean(item.id && item.summary && item.timeZone && item.accessRole)).map((item) => ({ id: item.id, summary: item.summary, timeZone: item.timeZone, primary: Boolean(item.primary), accessRole: item.accessRole }));
}

export async function listGoogleBusyIntervals(accessToken: string, calendarId: string, timeMin: string, timeMax: string, timeZone: string) {
  const result = await googleRequest<{ calendars?: Record<string, { busy?: GoogleBusyInterval[]; errors?: unknown[] }> }>(`${GOOGLE_API_URL}/freeBusy`, {
    method: 'POST', headers: { ...bearer(accessToken), 'content-type': 'application/json' }, body: JSON.stringify({ timeMin, timeMax, timeZone, items: [{ id: calendarId }] }),
  }, 'Não foi possível consultar a disponibilidade do Google Calendar.');
  const calendar = result.calendars?.[calendarId];
  if (!calendar || calendar.errors?.length) throw new GoogleCalendarError('O calendário selecionado não pôde ser consultado.', 'GOOGLE_CALENDAR_FREEBUSY_FAILED', 503);
  return calendar.busy ?? [];
}

export function removeBusySlots<T extends { startAt: string; endAt: string }>(slots: T[], busy: GoogleBusyInterval[]) {
  return slots.filter((slot) => !busy.some((interval) => new Date(slot.startAt).getTime() < new Date(interval.end).getTime() && new Date(slot.endAt).getTime() > new Date(interval.start).getTime()));
}

export function googleEventId(sessionId: string) { return `forge${sessionId.replaceAll('-', '').toLowerCase()}`; }

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  sessionId: string;
  summary: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  attendeeName: string;
  attendeeContact: string;
}) {
  const id = googleEventId(input.sessionId);
  const attendeeIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.attendeeContact);
  const url = new URL(`${GOOGLE_API_URL}/calendars/${encodeURIComponent(input.calendarId)}/events`);
  url.searchParams.set('conferenceDataVersion', '1');
  url.searchParams.set('sendUpdates', attendeeIsEmail ? 'all' : 'none');
  const payload = {
    id,
    summary: input.summary,
    description: `Agendamento criado pelo Forge. Referência: ${input.sessionId}`,
    start: { dateTime: input.startAt, timeZone: input.timeZone },
    end: { dateTime: input.endAt, timeZone: input.timeZone },
    ...(attendeeIsEmail ? { attendees: [{ email: input.attendeeContact, displayName: input.attendeeName }] } : {}),
    conferenceData: { createRequest: { requestId: `meet${input.sessionId.replaceAll('-', '')}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    extendedProperties: { private: { forgeSessionId: input.sessionId } },
  };
  try {
    return await googleRequest<GoogleCalendarEvent>(url.toString(), { method: 'POST', headers: { ...bearer(input.accessToken), 'content-type': 'application/json' }, body: JSON.stringify(payload) }, 'Não foi possível criar o evento no Google Calendar.');
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.upstreamStatus !== 409) throw error;
    const existingUrl = `${GOOGLE_API_URL}/calendars/${encodeURIComponent(input.calendarId)}/events/${id}`;
    return googleRequest<GoogleCalendarEvent>(existingUrl, { headers: bearer(input.accessToken) }, 'Não foi possível recuperar o evento do Google Calendar.');
  }
}

export function googleConferenceUrl(event: GoogleCalendarEvent) {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ?? null;
}

export async function revokeGoogleRefreshToken(refreshToken: string) {
  try {
    await fetch(GOOGLE_REVOKE_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch { /* Local disconnection must still complete if Google is unavailable. */ }
}
