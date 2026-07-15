import { describe, expect, it } from 'vitest';
import { applyQualificationAnswer, firstQualificationTurn, listInternalAvailability, qualificationConfigSchema, qualificationScore } from './qualification.js';

const config = qualificationConfigSchema.parse({ businessName: 'NetoLabs', offerName: 'diagnóstico comercial', serviceArea: 'Brasil', meetingTitle: 'diagnóstico de 30 minutos' });

function complete(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    name: 'Luiz Neto', contact: 'luiz@example.com', company: 'NetoLabs', need: 'Quero organizar a operação comercial.', serviceAreaMatch: 'yes',
    decisionRole: 'decision_maker', timeline: 'within_30_days', investmentReadiness: 'planned', ...overrides,
  };
  let turn = firstQualificationTurn(config);
  for (const [questionKey, answer] of Object.entries(values)) turn = applyQualificationAnswer({ config, answers: turn.answers, expectedQuestionKey: turn.question!.key, questionKey, answer });
  return turn;
}

describe('qualification and scheduling Kit domain', () => {
  it('progresses one persisted question at a time and qualifies a strong in-area lead', () => {
    const turn = complete();
    expect(turn.status).toBe('qualified');
    expect(turn.score).toBe(7);
    expect(turn.question).toBeNull();
  });

  it('disqualifies an out-of-area lead regardless of score', () => {
    expect(complete({ serviceAreaMatch: 'no' }).status).toBe('disqualified');
  });

  it('rejects stale questions and invalid choice values', () => {
    const turn = firstQualificationTurn(config);
    expect(() => applyQualificationAnswer({ config, answers: {}, expectedQuestionKey: 'name', questionKey: 'timeline', answer: 'later' })).toThrow(/pergunta já mudou/i);
    const answers = { name: 'Luiz', contact: 'luiz@example.com', company: 'NetoLabs', need: 'Uma necessidade comercial válida.' };
    expect(() => applyQualificationAnswer({ config, answers, expectedQuestionKey: 'serviceAreaMatch', questionKey: 'serviceAreaMatch', answer: 'talvez' })).toThrow(/opções/i);
  });

  it('uses only the approved structured fields in the score', () => {
    expect(qualificationScore({ decisionRole: 'involved', timeline: 'within_90_days', investmentReadiness: 'evaluating' })).toBe(4);
  });

  it('generates future São Paulo slots and removes occupied starts', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const first = listInternalAvailability(config, [], now);
    expect(first.length).toBeGreaterThan(4);
    expect(first[0].startAt).toBe('2026-07-15T14:00:00.000Z');
    const filtered = listInternalAvailability(config, [first[0].startAt], now);
    expect(filtered.some((slot) => slot.startAt === first[0].startAt)).toBe(false);
  });

  it('removes every slot that overlaps an existing booking', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const hourly = qualificationConfigSchema.parse({ ...config, meetingDurationMinutes: 60, slotIntervalMinutes: 30 });
    const slots = listInternalAvailability(hourly, [{ startAt: '2026-07-15T14:00:00.000Z', endAt: '2026-07-15T15:00:00.000Z' }], now);
    expect(slots.some((slot) => slot.startAt === '2026-07-15T14:00:00.000Z')).toBe(false);
    expect(slots.some((slot) => slot.startAt === '2026-07-15T14:30:00.000Z')).toBe(false);
    expect(slots.some((slot) => slot.startAt === '2026-07-15T15:00:00.000Z')).toBe(true);
  });
});
