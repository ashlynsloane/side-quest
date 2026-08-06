import type {
  AdaptationBalanceFinding,
  IntelligentTrainingSession,
  TrainingBlockIntelligenceInput,
  TrainingBlockIntelligenceResult,
  TrainingDebtEntry,
  TrainingInterferenceFinding,
  TrainingObjective,
  TrainingSessionRole,
} from '@circuit/domain';

const ROLE_PRIORITY: Record<TrainingSessionRole, number> = {
  event: 100,
  key: 90,
  supporting: 65,
  maintenance: 55,
  technique: 50,
  recovery: 45,
  optional: 20,
  bonus: 10,
};

const OBJECTIVE_VALUE: Record<TrainingObjective, number> = {
  race_specific: 100,
  lactate_threshold: 88,
  vo2_max: 86,
  aerobic_base: 82,
  max_strength: 78,
  neuromuscular_speed: 76,
  muscular_endurance: 72,
  technique: 68,
  injury_prevention: 66,
  hypertrophy: 58,
  mobility: 48,
  recovery: 40,
};

const INTERFERENCE_PAIRS = new Set([
  'max_strength|vo2_max',
  'max_strength|neuromuscular_speed',
  'hypertrophy|vo2_max',
  'muscular_endurance|max_strength',
  'neuromuscular_speed|lactate_threshold',
]);

function pairKey(a: TrainingObjective, b: TrainingObjective): string {
  return [a, b].sort().join('|');
}

function dayDistance(left: string, right: string): number {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 86_400_000;
}

function weeklyCounts(sessions: IntelligentTrainingSession[]): Map<TrainingObjective, number> {
  const counts = new Map<TrainingObjective, number>();
  for (const session of sessions) counts.set(session.objective, (counts.get(session.objective) ?? 0) + 1);
  return counts;
}

function balanceFor(input: TrainingBlockIntelligenceInput): AdaptationBalanceFinding[] {
  const counts = weeklyCounts(input.sessions.filter((session) => !(input.missedSessionIds ?? []).includes(session.sessionId)));
  const profiles = [
    { objective: input.block.primaryObjective, priority: 100, minimumWeeklyExposures: 1, maximumWeeklyExposures: 3, rationale: 'Primary block objective.' },
    ...input.block.secondaryObjectives,
  ];
  return profiles.map((profile) => {
    const count = counts.get(profile.objective) ?? 0;
    const minimum = profile.minimumWeeklyExposures ?? 0;
    const maximum = profile.maximumWeeklyExposures ?? Number.POSITIVE_INFINITY;
    const status = count < minimum ? 'insufficient' : count > maximum ? 'excessive' : 'balanced';
    return {
      objective: profile.objective,
      weeklyExposureCount: count,
      status,
      reasons: [
        `${count} completed or planned exposure${count === 1 ? '' : 's'} support this objective.`,
        status === 'insufficient' ? `The block calls for at least ${minimum}.` : status === 'excessive' ? `The block ceiling is ${maximum}.` : 'Exposure is inside the intended block range.',
      ],
    };
  });
}

function interferenceFor(sessions: IntelligentTrainingSession[]): TrainingInterferenceFinding[] {
  const findings: TrainingInterferenceFinding[] = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const left = sessions[i]!;
      const right = sessions[j]!;
      if (!INTERFERENCE_PAIRS.has(pairKey(left.objective, right.objective))) continue;
      const distance = dayDistance(left.startsAt, right.startsAt);
      if (distance > 2) continue;
      const severity = distance < 0.75 ? 'high' : distance <= 1.25 ? 'meaningful' : 'watch';
      findings.push({
        findingId: `interference:${left.sessionId}:${right.sessionId}`,
        sessionIds: [left.sessionId, right.sessionId],
        severity,
        competingObjectives: [left.objective, right.objective],
        reasons: [`${left.title} and ${right.title} place competing adaptation demands within ${distance.toFixed(1)} days.`],
      });
    }
  }
  return findings;
}

function debtFor(input: TrainingBlockIntelligenceInput): TrainingDebtEntry[] {
  const debt = new Map<TrainingObjective, TrainingDebtEntry>();
  for (const existing of input.priorDebt ?? []) debt.set(existing.objective, { ...existing, sourceSessionIds: [...existing.sourceSessionIds], reasons: [...existing.reasons] });
  for (const session of input.sessions.filter((item) => (input.missedSessionIds ?? []).includes(item.sessionId))) {
    if (session.role === 'bonus' || session.role === 'optional' || session.role === 'recovery') continue;
    const current = debt.get(session.objective);
    const amount = Math.max(1, Math.round((session.targetLoad ?? session.durationMinutes) / 30));
    debt.set(session.objective, {
      objective: session.objective,
      amount: (current?.amount ?? 0) + amount,
      sourceSessionIds: [...(current?.sourceSessionIds ?? []), session.sessionId],
      priority: Math.max(current?.priority ?? 0, ROLE_PRIORITY[session.role] + OBJECTIVE_VALUE[session.objective] / 10),
      expiresAfterDays: session.objective === 'technique' || session.objective === 'mobility' ? 7 : 14,
      reasons: [...(current?.reasons ?? []), `${session.title} was missed; its adaptation value is tracked rather than blindly replayed.`],
    });
  }
  return [...debt.values()].sort((a, b) => b.priority - a.priority || b.amount - a.amount);
}

function sacrificeOrder(sessions: IntelligentTrainingSession[], primary: TrainingObjective): string[] {
  return [...sessions]
    .filter((session) => session.role !== 'event' && session.role !== 'key')
    .sort((left, right) => {
      const leftScore = ROLE_PRIORITY[left.role] + OBJECTIVE_VALUE[left.objective] + (left.objective === primary ? 40 : 0);
      const rightScore = ROLE_PRIORITY[right.role] + OBJECTIVE_VALUE[right.objective] + (right.objective === primary ? 40 : 0);
      return leftScore - rightScore || left.startsAt.localeCompare(right.startsAt);
    })
    .map((session) => session.sessionId);
}

export function evaluateTrainingBlockIntelligence(
  input: TrainingBlockIntelligenceInput,
): TrainingBlockIntelligenceResult {
  const adaptationBalance = balanceFor(input);
  const interferenceFindings = interferenceFor(input.sessions);
  const trainingDebt = debtFor(input);
  const protectedSessionIds = input.sessions
    .filter((session) => session.role === 'event' || session.role === 'key' || session.objective === input.block.primaryObjective)
    .map((session) => session.sessionId);
  return {
    generatedAt: input.generatedAt,
    blockId: input.block.blockId,
    phase: input.block.phase,
    primaryObjective: input.block.primaryObjective,
    adaptationBalance,
    interferenceFindings,
    trainingDebt,
    protectedSessionIds,
    sacrificeOrderSessionIds: sacrificeOrder(input.sessions, input.block.primaryObjective),
    explanations: [
      `This ${input.block.phase} block is optimized around ${input.block.primaryObjective}.`,
      'Session value is determined by objective and role, not simply by duration or load.',
      'Missed training creates prioritized adaptation debt; Side Quest does not automatically replay every missed workout.',
    ],
    safeguards: [
      'Event and key sessions are protected.',
      'The primary block objective cannot be sacrificed before optional or supporting work.',
      'Training debt is informational and never triggers compensatory exercise.',
      'The model does not recommend calorie restriction or weight-loss targets.',
    ],
  };
}
