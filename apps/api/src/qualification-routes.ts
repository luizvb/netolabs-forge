import type { FastifyInstance } from 'fastify';
import { agents, and, desc, eq, evalScenarios, getDb, gte, qualificationEvents, qualificationSessions, scheduledBookings, sql } from '@forge/db';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { createAgentWithCapacity } from './entitlements.js';
import { syncBenchlineAfterAgentChange } from './benchline.js';
import { applyGoogleAvailability, googleBusyForWindow, googleConnectionForAgent, markGoogleConnectionError } from './calendar-routes.js';
import { createGoogleCalendarEvent, googleConferenceUrl, removeBusySlots } from './google-calendar.js';
import {
  QUALIFICATION_TEMPLATE_KEY,
  QUALIFICATION_TEMPLATE_VERSION,
  applyQualificationAnswer,
  buildQualificationInstructions,
  firstQualificationTurn,
  internalSchedulingProvider,
  qualificationConfigSchema,
  qualificationEvalScenarios,
  qualificationTemplate,
  resumeQualificationTurn,
  type AvailabilitySlot,
  type QualificationConfig,
  type QualificationTurn,
} from './qualification.js';

const db = getDb();
const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
const publicRequestSchema = z.object({ requestId: z.string().min(8).max(120) });

const installSchema = z.object({
  name: z.string().min(2).max(120),
  model: z.string().min(3).max(120).default('google/gemini-2.5-flash'),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high']).default('none'),
  config: qualificationConfigSchema,
});

function publicTurn(turn: QualificationTurn, slots: AvailabilitySlot[] = []) {
  return { status: turn.status, message: turn.message, question: turn.question, slots };
}

async function qualificationAgent(agentId: string, workspaceId: string) {
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId))).limit(1);
  if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
  if (agent.templateKey !== QUALIFICATION_TEMPLATE_KEY || agent.templateVersion !== QUALIFICATION_TEMPLATE_VERSION) throw Object.assign(new Error('Este agente não usa o Kit de Qualificação + Agendamento.'), { statusCode: 409, code: 'QUALIFICATION_KIT_REQUIRED' });
  return { agent, config: qualificationConfigSchema.parse(agent.templateConfig) };
}

async function publicQualificationAgent(publicId: string) {
  const [agent] = await db.select().from(agents).where(and(eq(agents.publicId, publicId), eq(agents.isPublic, true), eq(agents.status, 'ready'), eq(agents.templateKey, QUALIFICATION_TEMPLATE_KEY), eq(agents.templateVersion, QUALIFICATION_TEMPLATE_VERSION))).limit(1);
  if (!agent) throw Object.assign(new Error('Agente de qualificação não encontrado.'), { statusCode: 404 });
  return { agent, config: qualificationConfigSchema.parse(agent.templateConfig) };
}

async function availableSlots(agentId: string, workspaceId: string, config: QualificationConfig, now = new Date()) {
  const occupied = await db.select({ startAt: scheduledBookings.startAt, endAt: scheduledBookings.endAt }).from(scheduledBookings).where(and(eq(scheduledBookings.agentId, agentId), eq(scheduledBookings.status, 'confirmed'), gte(scheduledBookings.endAt, now)));
  const slots = internalSchedulingProvider.listAvailability(config, occupied, now);
  const connection = await googleConnectionForAgent(agentId, workspaceId);
  return connection ? applyGoogleAvailability(connection, slots) : slots;
}

function bookingResponse(booking: typeof scheduledBookings.$inferSelect, config: QualificationConfig, reused = false) {
  return {
    status: 'booked' as const,
    message: `${config.meetingTitle} confirmado. A equipe usará o contato informado para os detalhes.`,
    booking: { id: booking.id, startAt: booking.startAt, endAt: booking.endAt, timeZone: booking.timeZone, status: booking.status, conferenceUrl: booking.externalConferenceUrl },
    reused,
  };
}

export function registerQualificationRoutes(app: FastifyInstance) {
  app.get('/agent-templates', async (request) => {
    await requireAuth(request);
    return [{ ...qualificationTemplate, status: 'available' }];
  });

  app.post('/agent-templates/qualification-scheduling/install', async (request, reply) => {
    const auth = await requireAuth(request);
    const input = installSchema.parse(request.body);
    const config = qualificationConfigSchema.parse(input.config);
    const instructions = buildQualificationInstructions(config);
    const created = await createAgentWithCapacity(auth.workspaceId, {
      name: input.name,
      description: `Qualifica oportunidades para ${config.offerName} e confirma ${config.meetingTitle}.`,
      instructions,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      promptDefinition: `Kit ${QUALIFICATION_TEMPLATE_KEY} v${QUALIFICATION_TEMPLATE_VERSION}: ${config.offerName}`,
      guardrails: ['Nunca inventar disponibilidade ou confirmação de agenda.', 'Nunca expor dados de outros leads.', 'Escalar compromissos comerciais e casos sensíveis para uma pessoa autorizada.'],
      promptGeneratedAt: new Date(),
      templateKey: QUALIFICATION_TEMPLATE_KEY,
      templateVersion: QUALIFICATION_TEMPLATE_VERSION,
      templateConfig: config,
      slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}`,
    });
    try {
      await db.insert(evalScenarios).values(qualificationEvalScenarios.map((scenario) => ({
        agentId: created.agent.id,
        name: scenario.name,
        input: scenario.input,
        expectedBehavior: scenario.expectedBehavior,
        category: scenario.category,
        weight: scenario.weight,
        assertions: { ...scenario.assertions, mustNotContain: scenario.assertions.mustNotContain ? [...scenario.assertions.mustNotContain] : undefined },
        generatedBy: 'kit',
        generationMetadata: { templateKey: QUALIFICATION_TEMPLATE_KEY, templateVersion: QUALIFICATION_TEMPLATE_VERSION },
      })));
    } catch (error) {
      await db.delete(agents).where(and(eq(agents.id, created.agent.id), eq(agents.workspaceId, auth.workspaceId)));
      throw error;
    }
    await syncBenchlineAfterAgentChange(auth.workspaceId);
    return reply.code(201).send({ ...created.agent, storedInactive: created.storedInactive, evalScenarios: qualificationEvalScenarios.length });
  });

  app.get('/agents/:id/qualification', async (request) => {
    const auth = await requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { agent, config } = await qualificationAgent(id, auth.workspaceId);
    const [sessions, bookings, [sessionMetrics], [bookingMetrics]] = await Promise.all([
      db.select().from(qualificationSessions).where(and(eq(qualificationSessions.agentId, id), eq(qualificationSessions.workspaceId, auth.workspaceId))).orderBy(desc(qualificationSessions.createdAt)).limit(100),
      db.select().from(scheduledBookings).where(and(eq(scheduledBookings.agentId, id), eq(scheduledBookings.workspaceId, auth.workspaceId))).orderBy(desc(scheduledBookings.startAt)).limit(100),
      db.select({
        sessions: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${qualificationSessions.status} <> 'collecting')::int`,
        qualified: sql<number>`count(*) filter (where ${qualificationSessions.status} in ('qualified', 'booked'))::int`,
      }).from(qualificationSessions).where(and(eq(qualificationSessions.agentId, id), eq(qualificationSessions.workspaceId, auth.workspaceId))),
      db.select({ booked: sql<number>`count(*)::int` }).from(scheduledBookings).where(and(eq(scheduledBookings.agentId, id), eq(scheduledBookings.workspaceId, auth.workspaceId))),
    ]);
    const completed = sessionMetrics?.completed ?? 0;
    const qualified = sessionMetrics?.qualified ?? 0;
    const booked = bookingMetrics?.booked ?? 0;
    return {
      agent: { id: agent.id, name: agent.name, status: agent.status, isPublic: agent.isPublic },
      config,
      metrics: {
        sessions: sessionMetrics?.sessions ?? 0,
        completed,
        qualified,
        booked,
        qualificationRate: completed ? qualified / completed : 0,
        bookingRate: qualified ? booked / qualified : 0,
      },
      leads: sessions.map((session) => ({ id: session.id, publicId: session.publicId, status: session.status, score: session.score, outcome: session.outcome, answers: session.answers, createdAt: session.createdAt, completedAt: session.completedAt })),
      bookings: bookings.map((booking) => ({ id: booking.id, sessionId: booking.sessionId, status: booking.status, startAt: booking.startAt, endAt: booking.endAt, timeZone: booking.timeZone, contactName: booking.contactName, contact: booking.contact, company: booking.company, notes: booking.notes, externalProvider: booking.externalProvider, externalEventUrl: booking.externalEventUrl, externalConferenceUrl: booking.externalConferenceUrl, externalSyncStatus: booking.externalSyncStatus, createdAt: booking.createdAt })),
    };
  });

  app.post('/public/agents/:publicId/qualification/start', async (request, reply) => {
    const { publicId } = z.object({ publicId: z.string().uuid() }).parse(request.params);
    z.object({ consentAccepted: z.literal(true) }).parse(request.body);
    const { agent, config } = await publicQualificationAgent(publicId);
    const first = firstQualificationTurn(config);
    const [session] = await db.insert(qualificationSessions).values({ workspaceId: agent.workspaceId, agentId: agent.id, status: first.status, currentQuestionKey: first.question!.key, answers: {}, consentAcceptedAt: new Date() }).returning();
    return reply.code(201).send({ sessionId: session.publicId, ...publicTurn(first) });
  });

  app.get('/public/agents/:publicId/qualification/:sessionId', async (request) => {
    const { publicId, sessionId } = z.object({ publicId: z.string().uuid(), sessionId: z.string().uuid() }).parse(request.params);
    const { agent, config } = await publicQualificationAgent(publicId);
    const [session] = await db.select().from(qualificationSessions).where(and(eq(qualificationSessions.publicId, sessionId), eq(qualificationSessions.agentId, agent.id), eq(qualificationSessions.workspaceId, agent.workspaceId))).limit(1);
    if (!session) throw Object.assign(new Error('Sessão de qualificação não encontrada.'), { statusCode: 404 });
    if (session.status === 'booked') {
      const [booking] = await db.select().from(scheduledBookings).where(eq(scheduledBookings.sessionId, session.id)).limit(1);
      if (booking) return { sessionId: session.publicId, ...bookingResponse(booking, config, true) };
    }
    const turn = resumeQualificationTurn(config, { status: session.status as 'collecting' | 'qualified' | 'disqualified' | 'booked', currentQuestionKey: session.currentQuestionKey, answers: session.answers, score: session.score });
    return { sessionId: session.publicId, ...publicTurn(turn, session.status === 'qualified' ? await availableSlots(agent.id, agent.workspaceId, config) : []) };
  });

  app.post('/public/agents/:publicId/qualification/:sessionId/respond', async (request) => {
    const { publicId, sessionId } = z.object({ publicId: z.string().uuid(), sessionId: z.string().uuid() }).parse(request.params);
    const body = publicRequestSchema.extend({ questionKey: z.string().min(1).max(80), answer: z.string().min(1).max(2_000) }).parse(request.body);
    const { agent, config } = await publicQualificationAgent(publicId);
    const persisted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`qualification:${sessionId}`}))`);
      const [existing] = await tx.select({ result: qualificationEvents.result }).from(qualificationEvents).innerJoin(qualificationSessions, eq(qualificationSessions.id, qualificationEvents.sessionId)).where(and(eq(qualificationSessions.publicId, sessionId), eq(qualificationSessions.agentId, agent.id), eq(qualificationSessions.workspaceId, agent.workspaceId), eq(qualificationEvents.requestId, body.requestId))).limit(1);
      if (existing) return existing.result;
      const [session] = await tx.select().from(qualificationSessions).where(and(eq(qualificationSessions.publicId, sessionId), eq(qualificationSessions.agentId, agent.id), eq(qualificationSessions.workspaceId, agent.workspaceId))).limit(1);
      if (!session) throw Object.assign(new Error('Sessão de qualificação não encontrada.'), { statusCode: 404 });
      if (session.status !== 'collecting') throw Object.assign(new Error('Esta qualificação já foi concluída.'), { statusCode: 409, code: 'QUALIFICATION_ALREADY_COMPLETED' });
      const turn = applyQualificationAnswer({ config, answers: session.answers, expectedQuestionKey: session.currentQuestionKey, questionKey: body.questionKey, answer: body.answer });
      const result = publicTurn(turn);
      await tx.update(qualificationSessions).set({ answers: turn.answers, score: turn.score, status: turn.status, outcome: turn.status === 'collecting' ? null : turn.status, currentQuestionKey: turn.question?.key ?? session.currentQuestionKey, completedAt: turn.status === 'collecting' ? null : new Date(), updatedAt: new Date() }).where(eq(qualificationSessions.id, session.id));
      await tx.insert(qualificationEvents).values({ sessionId: session.id, requestId: body.requestId, questionKey: body.questionKey, answer: body.answer.trim(), result });
      return result;
    });
    return persisted.status === 'qualified' ? { ...persisted, slots: await availableSlots(agent.id, agent.workspaceId, config) } : persisted;
  });

  app.post('/public/agents/:publicId/qualification/:sessionId/bookings', async (request) => {
    const { publicId, sessionId } = z.object({ publicId: z.string().uuid(), sessionId: z.string().uuid() }).parse(request.params);
    const body = publicRequestSchema.extend({ startAt: z.string().datetime() }).parse(request.body);
    const { agent, config } = await publicQualificationAgent(publicId);
    const calendarConnection = await googleConnectionForAgent(agent.id, agent.workspaceId);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking:${agent.id}`}))`);
      const [session] = await tx.select().from(qualificationSessions).where(and(eq(qualificationSessions.publicId, sessionId), eq(qualificationSessions.agentId, agent.id), eq(qualificationSessions.workspaceId, agent.workspaceId))).limit(1);
      if (!session) throw Object.assign(new Error('Sessão de qualificação não encontrada.'), { statusCode: 404 });
      const [reused] = await tx.select().from(scheduledBookings).where(and(eq(scheduledBookings.workspaceId, agent.workspaceId), eq(scheduledBookings.idempotencyKey, body.requestId))).limit(1);
      if (reused) {
        if (reused.sessionId !== session.id) throw Object.assign(new Error('Esta chave de requisição já foi usada em outra operação.'), { statusCode: 409, code: 'BOOKING_IDEMPOTENCY_CONFLICT' });
        return bookingResponse(reused, config, true);
      }
      const [existingForSession] = await tx.select().from(scheduledBookings).where(eq(scheduledBookings.sessionId, session.id)).limit(1);
      if (existingForSession) return bookingResponse(existingForSession, config, true);
      if (session.status !== 'qualified') throw Object.assign(new Error('Conclua uma qualificação elegível antes de agendar.'), { statusCode: 409, code: 'QUALIFICATION_REQUIRED' });
      const occupied = await tx.select({ startAt: scheduledBookings.startAt, endAt: scheduledBookings.endAt }).from(scheduledBookings).where(and(eq(scheduledBookings.agentId, agent.id), eq(scheduledBookings.status, 'confirmed'), gte(scheduledBookings.endAt, new Date())));
      let slots = internalSchedulingProvider.listAvailability(config, occupied);
      let googleAccessToken: string | null = null;
      if (calendarConnection && slots.length) {
        const google = await googleBusyForWindow(calendarConnection, slots[0].startAt, slots.at(-1)!.endAt);
        googleAccessToken = google.accessToken;
        slots = removeBusySlots(slots, google.busy);
      }
      const selected = slots.find((slot) => slot.startAt === new Date(body.startAt).toISOString());
      if (!selected) throw Object.assign(new Error('Este horário não está mais disponível. Escolha uma nova opção.'), { statusCode: 409, code: 'BOOKING_SLOT_UNAVAILABLE', details: { slots } });
      let externalEvent = null;
      if (calendarConnection && googleAccessToken) {
        try {
          externalEvent = await createGoogleCalendarEvent({
            accessToken: googleAccessToken,
            calendarId: calendarConnection.calendarId,
            sessionId: session.id,
            summary: config.meetingTitle,
            startAt: selected.startAt,
            endAt: selected.endAt,
            timeZone: selected.timeZone,
            attendeeName: session.answers.name,
            attendeeContact: session.answers.contact,
          });
        } catch (error) {
          await markGoogleConnectionError(calendarConnection, error);
          throw error;
        }
      }
      const [booking] = await tx.insert(scheduledBookings).values({
        workspaceId: agent.workspaceId, agentId: agent.id, sessionId: session.id, idempotencyKey: body.requestId,
        startAt: new Date(selected.startAt), endAt: new Date(selected.endAt), timeZone: selected.timeZone,
        contactName: session.answers.name, contact: session.answers.contact, company: session.answers.company, notes: session.answers.need,
        externalProvider: externalEvent ? 'google' : null,
        externalEventId: externalEvent?.id ?? null,
        externalEventUrl: externalEvent?.htmlLink ?? null,
        externalConferenceUrl: externalEvent ? googleConferenceUrl(externalEvent) : null,
        externalSyncStatus: externalEvent ? 'synced' : 'not_required',
      }).returning();
      await tx.update(qualificationSessions).set({ status: 'booked', outcome: 'booking_confirmed', updatedAt: new Date() }).where(eq(qualificationSessions.id, session.id));
      return bookingResponse(booking, config);
    });
  });
}
