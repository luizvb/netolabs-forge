import type { FastifyInstance } from 'fastify';
import { agents, and, calendarConnections, eq, getDb } from '@forge/db';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { requireWorkspacePlanAccess } from './entitlements.js';
import {
  GoogleCalendarError,
  GOOGLE_CALENDAR_SCOPES,
  createGoogleOAuthState,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  googleAuthorizationUrl,
  googleCalendarConfigured,
  listGoogleBusyIntervals,
  listGoogleCalendars,
  refreshGoogleAccessToken,
  removeBusySlots,
  revokeGoogleRefreshToken,
  verifyGoogleOAuthState,
  type GoogleBusyInterval,
} from './google-calendar.js';
import { QUALIFICATION_TEMPLATE_KEY, QUALIFICATION_TEMPLATE_VERSION, type AvailabilitySlot } from './qualification.js';

const db = getDb();
type CalendarConnection = typeof calendarConnections.$inferSelect;

async function ownedQualificationAgent(agentId: string, workspaceId: string) {
  const [agent] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId), eq(agents.templateKey, QUALIFICATION_TEMPLATE_KEY), eq(agents.templateVersion, QUALIFICATION_TEMPLATE_VERSION))).limit(1);
  if (!agent) throw Object.assign(new Error('Agente de Qualificação + Agendamento não encontrado.'), { statusCode: 404 });
  return agent;
}

export async function googleConnectionForAgent(agentId: string, workspaceId: string) {
  const [connection] = await db.select().from(calendarConnections).where(and(eq(calendarConnections.agentId, agentId), eq(calendarConnections.workspaceId, workspaceId), eq(calendarConnections.provider, 'google'))).limit(1);
  return connection ?? null;
}

export async function markGoogleConnectionError(connection: CalendarConnection, error: unknown) {
  if (error instanceof GoogleCalendarError && error.reauthRequired) {
    await db.update(calendarConnections).set({ status: 'reauth_required', updatedAt: new Date() }).where(and(eq(calendarConnections.id, connection.id), eq(calendarConnections.workspaceId, connection.workspaceId)));
  }
}

export async function googleAccessForConnection(connection: CalendarConnection) {
  try {
    const refreshToken = decryptGoogleRefreshToken(connection.encryptedRefreshToken);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    await db.update(calendarConnections).set({ status: 'connected', lastValidatedAt: new Date(), updatedAt: new Date() }).where(eq(calendarConnections.id, connection.id));
    return accessToken;
  } catch (error) {
    await markGoogleConnectionError(connection, error);
    throw error;
  }
}

export async function applyGoogleAvailability(connection: CalendarConnection, slots: AvailabilitySlot[]) {
  if (!slots.length) return slots;
  if (connection.status !== 'connected') throw new GoogleCalendarError('A agenda Google precisa ser reconectada antes de oferecer horários.', 'GOOGLE_CALENDAR_REAUTH_REQUIRED', 503, true);
  try {
    const accessToken = await googleAccessForConnection(connection);
    const busy = await listGoogleBusyIntervals(accessToken, connection.calendarId, slots[0].startAt, slots.at(-1)!.endAt, connection.calendarTimeZone);
    return removeBusySlots(slots, busy);
  } catch (error) {
    await markGoogleConnectionError(connection, error);
    throw error;
  }
}

export async function googleBusyForWindow(connection: CalendarConnection, startAt: string, endAt: string): Promise<{ accessToken: string; busy: GoogleBusyInterval[] }> {
  if (connection.status !== 'connected') throw new GoogleCalendarError('A agenda Google precisa ser reconectada antes de confirmar horários.', 'GOOGLE_CALENDAR_REAUTH_REQUIRED', 503, true);
  try {
    const accessToken = await googleAccessForConnection(connection);
    const busy = await listGoogleBusyIntervals(accessToken, connection.calendarId, startAt, endAt, connection.calendarTimeZone);
    return { accessToken, busy };
  } catch (error) {
    await markGoogleConnectionError(connection, error);
    throw error;
  }
}

function safeConnection(connection: CalendarConnection | null) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    calendarId: connection.calendarId,
    calendarName: connection.calendarName,
    calendarTimeZone: connection.calendarTimeZone,
    scopes: connection.scopes,
    lastValidatedAt: connection.lastValidatedAt,
    connectedAt: connection.createdAt,
  };
}

function webRedirect(agentId: string | null, outcome: 'connected' | 'denied' | 'error') {
  const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
  return agentId ? `${origin}/agents/${encodeURIComponent(agentId)}?calendar=${outcome}` : `${origin}/kits?calendar=${outcome}`;
}

export function registerCalendarRoutes(app: FastifyInstance) {
  app.get('/agents/:id/calendar-connection', async (request) => {
    const auth = await requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedQualificationAgent(id, auth.workspaceId);
    return { configured: googleCalendarConfigured(), connection: safeConnection(await googleConnectionForAgent(id, auth.workspaceId)) };
  });

  app.post('/agents/:id/calendar-connection/google/authorize', async (request) => {
    const auth = await requireAuth(request);
    await requireWorkspacePlanAccess(auth.workspaceId);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedQualificationAgent(id, auth.workspaceId);
    const state = createGoogleOAuthState({ agentId: id, workspaceId: auth.workspaceId, userId: auth.userId });
    return { authorizationUrl: googleAuthorizationUrl(state) };
  });

  app.get('/calendar-connections/google/callback', async (request, reply) => {
    const query = z.object({ code: z.string().min(1).optional(), state: z.string().min(20), error: z.string().optional() }).parse(request.query);
    let agentId = '';
    try {
      const state = verifyGoogleOAuthState(query.state);
      agentId = state.agentId;
      await requireWorkspacePlanAccess(state.workspaceId);
      await ownedQualificationAgent(state.agentId, state.workspaceId);
      if (query.error || !query.code) return reply.redirect(webRedirect(state.agentId, 'denied'));
      const tokens = await exchangeGoogleAuthorizationCode(query.code);
      if (!tokens.refresh_token) throw new GoogleCalendarError('O Google não devolveu uma autorização offline. Tente conectar novamente.', 'GOOGLE_OAUTH_REFRESH_TOKEN_MISSING', 409);
      const grantedScopes = new Set(tokens.scope?.split(' ').filter(Boolean) ?? []);
      if (GOOGLE_CALENDAR_SCOPES.some((scope) => !grantedScopes.has(scope))) throw new GoogleCalendarError('Autorize todas as permissões de agenda solicitadas para concluir a conexão.', 'GOOGLE_OAUTH_SCOPE_MISSING', 409);
      const calendars = await listGoogleCalendars(tokens.access_token);
      const selected = calendars.find((calendar) => calendar.primary) ?? calendars[0];
      if (!selected) throw new GoogleCalendarError('Nenhum calendário com permissão de escrita foi encontrado.', 'GOOGLE_CALENDAR_NO_WRITABLE_CALENDAR', 409);
      await db.insert(calendarConnections).values({
        workspaceId: state.workspaceId,
        agentId: state.agentId,
        provider: 'google',
        status: 'connected',
        calendarId: selected.id,
        calendarName: selected.summary,
        calendarTimeZone: selected.timeZone,
        encryptedRefreshToken: encryptGoogleRefreshToken(tokens.refresh_token),
        scopes: [...grantedScopes],
        connectedByUserId: state.userId,
        lastValidatedAt: new Date(),
        tokenUpdatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [calendarConnections.agentId, calendarConnections.provider],
        set: {
          workspaceId: state.workspaceId,
          status: 'connected',
          calendarId: selected.id,
          calendarName: selected.summary,
          calendarTimeZone: selected.timeZone,
          encryptedRefreshToken: encryptGoogleRefreshToken(tokens.refresh_token),
          scopes: [...grantedScopes],
          connectedByUserId: state.userId,
          lastValidatedAt: new Date(),
          tokenUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return reply.redirect(webRedirect(state.agentId, 'connected'));
    } catch (error) {
      request.log.warn({ err: error, agentId }, 'Google Calendar OAuth callback failed');
      return reply.redirect(webRedirect(agentId || null, 'error'));
    }
  });

  app.get('/agents/:id/calendar-connection/calendars', async (request) => {
    const auth = await requireAuth(request);
    await requireWorkspacePlanAccess(auth.workspaceId);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedQualificationAgent(id, auth.workspaceId);
    const connection = await googleConnectionForAgent(id, auth.workspaceId);
    if (!connection) throw Object.assign(new Error('Conecte o Google Calendar primeiro.'), { statusCode: 409, code: 'GOOGLE_CALENDAR_NOT_CONNECTED' });
    return { calendars: await listGoogleCalendars(await googleAccessForConnection(connection)) };
  });

  app.patch('/agents/:id/calendar-connection', async (request) => {
    const auth = await requireAuth(request);
    await requireWorkspacePlanAccess(auth.workspaceId);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ calendarId: z.string().min(1).max(1_024) }).parse(request.body);
    await ownedQualificationAgent(id, auth.workspaceId);
    const connection = await googleConnectionForAgent(id, auth.workspaceId);
    if (!connection) throw Object.assign(new Error('Conecte o Google Calendar primeiro.'), { statusCode: 409, code: 'GOOGLE_CALENDAR_NOT_CONNECTED' });
    const calendars = await listGoogleCalendars(await googleAccessForConnection(connection));
    const selected = calendars.find((calendar) => calendar.id === body.calendarId);
    if (!selected) throw Object.assign(new Error('Escolha um calendário com permissão de escrita.'), { statusCode: 422, code: 'GOOGLE_CALENDAR_INVALID_SELECTION' });
    const [updated] = await db.update(calendarConnections).set({ calendarId: selected.id, calendarName: selected.summary, calendarTimeZone: selected.timeZone, status: 'connected', lastValidatedAt: new Date(), updatedAt: new Date() }).where(and(eq(calendarConnections.id, connection.id), eq(calendarConnections.workspaceId, auth.workspaceId))).returning();
    return { configured: googleCalendarConfigured(), connection: safeConnection(updated) };
  });

  app.delete('/agents/:id/calendar-connection', async (request, reply) => {
    const auth = await requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedQualificationAgent(id, auth.workspaceId);
    const connection = await googleConnectionForAgent(id, auth.workspaceId);
    if (connection) {
      try { await revokeGoogleRefreshToken(decryptGoogleRefreshToken(connection.encryptedRefreshToken)); } catch { /* Delete the unusable local credential too. */ }
      await db.delete(calendarConnections).where(and(eq(calendarConnections.id, connection.id), eq(calendarConnections.workspaceId, auth.workspaceId)));
    }
    return reply.code(204).send();
  });
}
